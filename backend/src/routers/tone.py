"""Reply tone matching router.

Matches the user's writing tone for email replies using the fine-tuned
Mistral-7B model. Falls back to Gemini for simple cases.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..models.routing import route_tone_matching
from ..config import settings

router = APIRouter()


class ToneRequest(BaseModel):
    """Request body for tone matching."""
    email_thread: list[dict]  # [{"from": str, "body": str}, ...]
    past_sent_emails: list[dict]  # [{"subject": str, "body": str}, ...]
    reply_instructions: str
    desired_tone: str | None = None  # "formal", "casual", "friendly", "professional"


class ToneResponse(BaseModel):
    """Response body for tone matching."""
    draft: str
    detected_tone: str
    model_used: str


@router.post("/", response_model=ToneResponse)
async def match_tone(request: ToneRequest):
    """Generate a reply matching the user's writing tone.

    Routes between fine-tuned Mistral-7B (for tone matching) and
    Gemini 2.0 Flash (for simple replies).
    """
    try:
        result = await route_tone_matching(
            email_thread=request.email_thread,
            past_sent_emails=request.past_sent_emails,
            reply_instructions=request.reply_instructions,
            desired_tone=request.desired_tone,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
