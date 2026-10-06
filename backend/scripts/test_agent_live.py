#!/usr/bin/env python3
"""Interactive & automated verification script for LangGraph Email Agent.

Run this script anytime to demo or test the Python Agentic AI workflow:
    python backend/scripts/test_agent_live.py
"""

import asyncio
import os
import sys

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
root_dir = os.path.dirname(backend_dir)
sys.path.insert(0, backend_dir)

from src.agent.agent import stream_agent_events
from src.config import settings
import psycopg2

def get_demo_account() -> tuple[str, str]:
    """Fetch an active synced account from the database."""
    try:
        conn = psycopg2.connect(settings.database_url)
        cur = conn.cursor()
        cur.execute("""
            SELECT id, "emailAddress", name 
            FROM "Account" 
            WHERE "syncStatus" = 'synced'
            ORDER BY id ASC
            LIMIT 1;
        """)
        row = cur.fetchone()
        conn.close()
        if row:
            return row[0], f"{row[2]} ({row[1]})"
    except Exception as e:
        print(f"Warning: could not fetch account from DB: {e}")
    return "1ed76134-6cc9-4fd5-abe3-1e1d5b75f48f", "Default Account"


async def run_agent_test(user_prompt: str):
    account_id, account_name = get_demo_account()
    
    print("\n" + "=" * 60)
    print("🤖 PYTHON AGENTIC AI LIVE DEMO / VERIFICATION")
    print("=" * 60)
    print(f"Account:  {account_name}")
    print(f"ID:       {account_id}")
    print(f"Prompt:   '{user_prompt}'")
    print("-" * 60)
    print("⚡ AGENT EXECUTION TRACE:")
    print("-" * 60)

    step_count = 0
    text_buffer = []

    async for event in stream_agent_events(user_prompt=user_prompt, account_id=account_id):
        event_type = event.get("type")
        
        if event_type == "tool_start":
            step_count += 1
            tool_name = event.get("tool")
            tool_input = event.get("input")
            print(f"\n[Step {step_count}] 🛠️  CALLING TOOL: '{tool_name}'")
            print(f"         Args: {tool_input}")
            
        elif event_type == "tool_end":
            tool_name = event.get("tool")
            tool_output = event.get("output", "")
            preview = tool_output[:160].replace("\n", " ")
            print(f"         ✅ OUTPUT ({len(tool_output)} chars): {preview}...")
            
        elif event_type == "text":
            chunk = event.get("content", "")
            text_buffer.append(chunk)
            print(chunk, end="", flush=True)
            
        elif event_type == "done":
            total_steps = event.get("step_count", step_count)
            print(f"\n\n" + "-" * 60)
            print(f"🏁 AGENT FINISHED: {total_steps} tool steps executed (Bounded by 5-step cap)")
            print("=" * 60 + "\n")
            
        elif event_type == "error":
            print(f"\n❌ ERROR: {event.get('message')}\n")

if __name__ == "__main__":
    prompt = sys.argv[1] if len(sys.argv) > 1 else "Find recent emails about meetings or important updates and summarize them."
    asyncio.run(run_agent_test(prompt))
