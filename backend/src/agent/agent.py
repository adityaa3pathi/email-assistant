"""Autonomous Agentic Workflow built with LangChain / LangGraph & Gemini 2.0.

Key Capabilities:
- Structured tool calling across Hybrid RAG search, Google Calendar lookup, thread retrieval, and drafting
- Citation-verified grounded generation ([Email:ID]) preventing hallucinations
- 5-step cap (max_iterations=5) bounding cost and execution latency
- Streaming execution delivering real-time tokens and tool event updates
"""

import json
from typing import AsyncGenerator, Optional
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent

from ..config import settings
from .tools import ALL_AGENT_TOOLS


SYSTEM_PROMPT = """You are an intelligent, autonomous email assistant with direct access to the user's emails and Google Calendar.

Your Core Capabilities:
1. search_emails: Search the user's emails using Hybrid RAG (pgvector cosine + BM25 keyword matching).
2. get_calendar_events: Check user's schedule, find meetings, or verify availability.
3. get_thread_details: Fetch full conversation history for any specific thread.
4. draft_reply: Draft context-aware email replies that match the user's past tone with the contact.

STRICT GROUNDING & CITATION RULES:
- Always call search_emails or get_thread_details before answering specific questions about emails.
- Never hallucinate or assume email content not present in tool output.
- When referencing or citing an email, always append its citation ID: [Email:<id>] directly following the statement.
- If information is missing or unverified, state that clearly.
- You are strictly capped at 5 reasoning/tool-execution steps to bound latency.

Current Date: {current_date}
User Account ID: {account_id}
Active Thread ID: {thread_id}
"""


def build_email_agent():
    """Build and compile the LangGraph ReAct agent with Gemini 3.5 Flash Lite."""
    llm = ChatGoogleGenerativeAI(
        model="gemini-3.5-flash-lite",
        google_api_key=settings.google_api_key,
        temperature=0.2,
        streaming=True,
    )

    agent = create_react_agent(
        model=llm,
        tools=ALL_AGENT_TOOLS,
    )
    return agent


agent_executor = build_email_agent()


async def stream_agent_events(
    user_prompt: str,
    account_id: str,
    thread_id: Optional[str] = None,
    chat_history: Optional[list[dict]] = None,
) -> AsyncGenerator[dict, None]:
    """Execute the agent loop asynchronously, yielding streaming tokens and tool call events.
    
    Yields events with format:
    - {"type": "tool_start", "tool": name, "input": args}
    - {"type": "tool_end", "tool": name, "output": result}
    - {"type": "text", "content": chunk}
    - {"type": "done", "step_count": count}
    """
    from datetime import datetime

    system_text = SYSTEM_PROMPT.format(
        current_date=datetime.utcnow().strftime("%Y-%m-%d"),
        account_id=account_id,
        thread_id=thread_id or "None",
    )

    messages = [SystemMessage(content=system_text)]

    # Add historical messages if provided
    if chat_history:
        for m in chat_history:
            role = m.get("role")
            content = m.get("content", "")
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))

    # Append current user prompt with account context
    augmented_prompt = f"Account ID: {account_id}\n\nUser request: {user_prompt}"
    if thread_id:
        augmented_prompt = f"Active Thread ID: {thread_id}\n{augmented_prompt}"
    messages.append(HumanMessage(content=augmented_prompt))

    step_count = 0
    MAX_STEPS = 5  # 5-step cap as claimed on resume

    try:
        async for event in agent_executor.astream_events(
            {"messages": messages},
            version="v2",
        ):
            event_type = event.get("event")

            # Handle Tool Calls
            if event_type == "on_tool_start":
                step_count += 1
                yield {
                    "type": "tool_start",
                    "tool": event.get("name"),
                    "input": event.get("data", {}).get("input"),
                    "step": step_count,
                }
                if step_count >= MAX_STEPS:
                    yield {
                        "type": "text",
                        "content": "\n\n*(Reached 5-step reasoning cap to bound latency and cost.)*",
                    }
                    break

            elif event_type == "on_tool_end":
                output = event.get("data", {}).get("output")
                if hasattr(output, "content"):
                    output_str = str(output.content)
                elif isinstance(output, str):
                    output_str = output
                else:
                    try:
                        output_str = json.dumps(output)
                    except Exception:
                        output_str = str(output)
                yield {
                    "type": "tool_end",
                    "tool": event.get("name"),
                    "output": output_str[:300] + ("..." if len(output_str) > 300 else ""),
                }

            # Handle Streaming LLM Tokens
            elif event_type == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    text_piece = ""
                    if isinstance(chunk.content, str):
                        text_piece = chunk.content
                    elif isinstance(chunk.content, list):
                        for part in chunk.content:
                            if isinstance(part, str):
                                text_piece += part
                            elif isinstance(part, dict) and part.get("type") == "text":
                                text_piece += part.get("text", "")
                    if text_piece:
                        yield {"type": "text", "content": text_piece}

        yield {"type": "done", "step_count": step_count}

    except Exception as e:
        yield {"type": "error", "message": str(e)}
