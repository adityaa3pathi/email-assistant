"""LangChain structured tools for Email Assistant Agent.

Provides:
- search_emails: Hybrid RAG (pgvector cosine + BM25 cover density + RRF)
- get_calendar_events: Google Calendar API event lookup & free/busy
- get_thread_details: Full thread context retrieval
- draft_reply: Grounded reply generation with recipient tone matching
"""

import json
from datetime import datetime
from typing import Any, Optional
import psycopg2
import psycopg2.extras
from langchain_core.tools import tool
import google.generativeai as genai

from ..config import settings

genai.configure(api_key=settings.google_api_key)


def get_db_connection():
    """Create a connection to the PostgreSQL database."""
    return psycopg2.connect(settings.database_url)


def generate_embedding(text: str) -> list[float]:
    """Generate a 768-dimensional embedding vector."""
    result = genai.embed_content(
        model="models/text-embedding-004",
        content=text,
        output_dimensionality=768,
    )
    return result["embedding"]


@tool
def search_emails(account_id: str, query: str, limit: int = 5) -> str:
    """Search the user's emails using Hybrid RAG (dense vector similarity + BM25 keyword matching).
    
    Args:
        account_id: The user's account ID to scope the search to.
        query: The natural language search query.
        limit: Maximum number of results to return (default 5).
        
    Returns:
        JSON string containing matching emails with citation IDs [Email:ID], subject, snippet, and similarity.
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # 1. Dense Semantic Search via pgvector
        query_vector = generate_embedding(query)
        vector_str = f"[{','.join(str(x) for x in query_vector)}]"

        cur.execute("""
            SELECT ee."emailId", ee.content, e.subject, e."bodySnippet", e."sentAt", e."threadId",
                   1 - (ee.embedding <=> %s::vector) AS similarity
            FROM "EmailEmbedding" ee
            JOIN "Email" e ON e.id = ee."emailId"
            WHERE ee."accountId" = %s
            ORDER BY ee.embedding <=> %s::vector
            LIMIT %s
        """, (vector_str, account_id, vector_str, limit * 2))
        dense_rows = cur.fetchall()

        # 2. Sparse BM25 Keyword Search
        cur.execute("""
            SELECT e.id AS "emailId", e.subject, e."bodySnippet", e."sentAt", e."threadId",
                   ts_rank_cd(e.fts_vector, plainto_tsquery('english', %s)) AS rank
            FROM "Email" e
            JOIN "Thread" t ON t.id = e."threadId"
            WHERE t."accountId" = %s
              AND e.fts_vector @@ plainto_tsquery('english', %s)
            ORDER BY rank DESC
            LIMIT %s
        """, (query, account_id, query, limit * 2))
        sparse_rows = cur.fetchall()

        # 3. Reciprocal Rank Fusion (RRF, k=60)
        K = 60.0
        scores: dict[str, float] = {}
        email_map: dict[str, dict] = {}

        for rank, row in enumerate(dense_rows):
            eid = row["emailId"]
            scores[eid] = scores.get(eid, 0.0) + (1.0 / (K + rank + 1))
            email_map[eid] = dict(row)

        for rank, row in enumerate(sparse_rows):
            eid = row["emailId"]
            scores[eid] = scores.get(eid, 0.0) + (1.0 / (K + rank + 1))
            if eid not in email_map:
                email_map[eid] = dict(row)

        # Sort by fused score
        sorted_ids = sorted(scores.keys(), key=lambda eid: scores[eid], reverse=True)[:limit]

        results = []
        for eid in sorted_ids:
            item = email_map[eid]
            sent_at_str = item["sentAt"].isoformat() if isinstance(item["sentAt"], datetime) else str(item["sentAt"])
            results.append({
                "citationId": f"[Email:{item['emailId']}]",
                "emailId": item["emailId"],
                "threadId": item["threadId"],
                "subject": item["subject"],
                "bodySnippet": item.get("bodySnippet") or item.get("content", ""),
                "sentAt": sent_at_str,
                "similarity": f"{round(float(item.get('similarity', 0.8)) * 100)}%" if "similarity" in item else "Keyword match",
            })

        return json.dumps(results, indent=2)

    except Exception as e:
        return json.dumps({"error": f"Search failed: {str(e)}"})
    finally:
        cur.close()
        conn.close()


@tool
def get_calendar_events(account_id: str, start_date: str, end_date: str) -> str:
    """Look up Google Calendar events and availability for the user.
    
    Args:
        account_id: The user's account ID.
        start_date: Start date/time in ISO format (e.g. '2026-10-04T00:00:00Z').
        end_date: End date/time in ISO format (e.g. '2026-10-05T00:00:00Z').
        
    Returns:
        JSON string with list of calendar events (summary, time, attendees, status).
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cur.execute("""
            SELECT "accessToken", "refreshToken", "tokenExpiresAt"
            FROM "Account"
            WHERE id = %s
        """, (account_id,))
        acc = cur.fetchone()
        if not acc or not acc["accessToken"]:
            return json.dumps({"error": "Account not found or missing Google credentials."})

        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds = Credentials(
            token=acc["accessToken"],
            refresh_token=acc["refreshToken"],
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.google_api_key or "",
            client_secret="",
        )

        service = build("calendar", "v3", credentials=creds)
        events_result = service.events().list(
            calendarId="primary",
            timeMin=start_date,
            timeMax=end_date,
            singleEvents=True,
            orderBy="startTime",
            maxResults=10,
        ).execute()

        events = events_result.get("items", [])
        formatted = []
        for e in events:
            formatted.append({
                "id": e.get("id"),
                "summary": e.get("summary", "(No title)"),
                "start": e.get("start", {}).get("dateTime", e.get("start", {}).get("date")),
                "end": e.get("end", {}).get("dateTime", e.get("end", {}).get("date")),
                "location": e.get("location"),
                "status": e.get("status", "confirmed"),
            })

        return json.dumps(formatted, indent=2)

    except Exception as e:
        return json.dumps({"notice": f"Calendar lookup unavailable or not permitted: {str(e)}"})
    finally:
        cur.close()
        conn.close()


@tool
def get_thread_details(thread_id: str) -> str:
    """Retrieve full messages and context for an email thread.
    
    Args:
        thread_id: The ID of the thread to inspect.
        
    Returns:
        JSON string containing the thread subject, AI summary, AI labels, and message details.
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cur.execute("""
            SELECT t.id, t.subject, t.summary, t."aiLabels",
                   e.id AS "emailId", e."bodySnippet", e."sentAt",
                   ea.name AS "senderName", ea.address AS "senderAddress"
            FROM "Thread" t
            JOIN "Email" e ON e."threadId" = t.id
            JOIN "EmailAddress" ea ON ea.id = e."fromId"
            WHERE t.id = %s
            ORDER BY e."sentAt" ASC
        """, (thread_id,))
        rows = cur.fetchall()

        if not rows:
            return json.dumps({"error": "Thread not found."})

        thread_info = {
            "threadId": rows[0]["id"],
            "subject": rows[0]["subject"],
            "summary": rows[0]["summary"],
            "aiLabels": rows[0]["aiLabels"],
            "emails": [
                {
                    "citationId": f"[Email:{r['emailId']}]",
                    "emailId": r["emailId"],
                    "from": f"{r['senderName']} <{r['senderAddress']}>" if r["senderName"] else r["senderAddress"],
                    "bodySnippet": r["bodySnippet"],
                    "sentAt": r["sentAt"].isoformat() if isinstance(r["sentAt"], datetime) else str(r["sentAt"]),
                }
                for r in rows
            ],
        }

        return json.dumps(thread_info, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        cur.close()
        conn.close()


@tool
def draft_reply(account_id: str, thread_id: str, instructions: str, tone: Optional[str] = "professional") -> str:
    """Draft a grounded, tone-matched reply to an email thread.
    
    Args:
        account_id: The user's account ID.
        thread_id: The thread to draft a reply for.
        instructions: Specific instructions on what to say or propose.
        tone: Desired tone (e.g. professional, casual, formal, friendly).
        
    Returns:
        JSON string containing the drafted response body, recipient, and subject.
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # Get thread and latest sender
        cur.execute("""
            SELECT t.subject, ea.address AS "replyToAddress", ea.name AS "replyToName", e."bodySnippet"
            FROM "Thread" t
            JOIN "Email" e ON e."threadId" = t.id
            JOIN "EmailAddress" ea ON ea.id = e."fromId"
            WHERE t.id = %s
            ORDER BY e."sentAt" DESC
            LIMIT 1
        """, (thread_id,))
        thread_row = cur.fetchone()
        if not thread_row:
            return json.dumps({"error": "Thread not found."})

        # Fetch past emails sent by the user to this contact to match tone
        cur.execute("""
            SELECT e.subject, e."bodySnippet"
            FROM "Email" e
            JOIN "Thread" t ON t.id = e."threadId"
            JOIN "EmailAddress" ea_from ON ea_from.id = e."fromId"
            JOIN "_ToEmails" to_rel ON to_rel."A" = e.id
            JOIN "EmailAddress" ea_to ON ea_to.id = to_rel."B"
            WHERE t."accountId" = %s
              AND ea_to.address = %s
            ORDER BY e."sentAt" DESC
            LIMIT 3
        """, (account_id, thread_row["replyToAddress"]))
        past_emails = cur.fetchall()

        tone_sample = ""
        if past_emails:
            tone_sample = "\nHistorical emails from user to this contact for tone matching:\n" + "\n".join(
                f"- Subject: {p['subject']}\n  Snippet: {p['bodySnippet']}" for p in past_emails
            )

        prompt = f"""Draft a reply to this email:
Subject: {thread_row['subject']}
Latest Message: {thread_row['bodySnippet']}

User Instructions: {instructions}
Desired Tone: {tone}
{tone_sample}

Rules:
- Write ONLY the email body.
- Be concise and match the user's voice.
"""
        model = genai.GenerativeModel("gemini-3.5-flash-lite")
        response = model.generate_content(prompt)

        return json.dumps({
            "to": f"{thread_row['replyToName']} <{thread_row['replyToAddress']}>" if thread_row["replyToName"] else thread_row["replyToAddress"],
            "subject": f"Re: {thread_row['subject']}",
            "draftBody": response.text.strip(),
        }, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        cur.close()
        conn.close()


ALL_AGENT_TOOLS = [search_emails, get_calendar_events, get_thread_details, draft_reply]
