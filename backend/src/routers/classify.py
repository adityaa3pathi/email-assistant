"""Email classification router.

Classifies emails into categories using the fine-tuned Mistral-7B model
with QLoRA adapter. Falls back to Gemini 2.0 Flash Lite if the fine-tuned
model is unavailable.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..models.routing import route_classification
from ..config import settings

router = APIRouter()


class ClassifyRequest(BaseModel):
    """Request body for email classification."""
    sender: str
    subject: str
    body_snippet: str
    use_finetuned: bool | None = None  # Override routing decision


class ClassifyResponse(BaseModel):
    """Response body for email classification."""
    labels: list[str]
    model_used: str  # "mistral-7b-qlora" or "gemini-2.0-flash-lite"
    confidence: float | None = None


@router.post("/", response_model=ClassifyResponse)
async def classify_email(request: ClassifyRequest):
    """Classify an email into one or more categories.

    Uses model routing to decide between fine-tuned Mistral-7B (lower cost,
    higher accuracy for classification) and Gemini 2.0 Flash Lite.
    """
    try:
        use_finetuned = request.use_finetuned if request.use_finetuned is not None \
            else settings.use_finetuned_for_classification

        result = await route_classification(
            sender=request.sender,
            subject=request.subject,
            body_snippet=request.body_snippet,
            use_finetuned=use_finetuned,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
