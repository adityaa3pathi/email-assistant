"""FastAPI router for LangChain / LangGraph Autonomous Email Agent."""

import json
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..agent.agent import stream_agent_events

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: Optional[str] = None
    parts: Optional[list] = None


class AgentChatRequest(BaseModel):
    messages: list[ChatMessage]
    accountId: str
    threadId: Optional[str] = None


@router.post("/chat")
async def chat_with_agent(request: AgentChatRequest):
    """Execute LangChain/LangGraph agentic workflow with real-time SSE event streaming.
    
    Streams:
    - Tool execution starts/ends
    - Token-by-token LLM generation
    - Citation markers [Email:ID]
    - Bounded by max 5 iterations
    """
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages list cannot be empty.")

    # Extract user prompt from latest message
    latest_msg = request.messages[-1]
    user_prompt = ""
    if latest_msg.content:
        user_prompt = latest_msg.content
    elif latest_msg.parts:
        for p in latest_msg.parts:
            if isinstance(p, dict) and p.get("type") == "text":
                user_prompt += p.get("text", "")
            elif hasattr(p, "text"):
                user_prompt += getattr(p, "text", "")

    if not user_prompt:
        user_prompt = "Hello"

    # Format historical chat
    chat_history = []
    for m in request.messages[:-1]:
        c = m.content or ""
        if not c and m.parts:
            for p in m.parts:
                if isinstance(p, dict) and p.get("type") == "text":
                    c += p.get("text", "")
        chat_history.append({"role": m.role, "content": c})

    async def event_generator():
        try:
            async for ev in stream_agent_events(
                user_prompt=user_prompt,
                account_id=request.accountId,
                thread_id=request.threadId,
                chat_history=chat_history,
            ):
                # Format as Server-Sent Event (SSE)
                data = json.dumps(ev)
                yield f"data: {data}\n\n"
        except Exception as e:
            err_data = json.dumps({"type": "error", "message": str(e)})
            yield f"data: {err_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        },
    )
