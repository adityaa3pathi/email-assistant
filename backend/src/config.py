"""Configuration for the email assistant backend."""

import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseModel):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/email-assistant")

    # Model paths
    base_model: str = "mistralai/Mistral-7B-Instruct-v0.3"
    classifier_adapter: str = "./adapters/classifier"
    tone_adapter: str = "./adapters/tone"

    # vLLM settings
    vllm_gpu_memory_utilization: float = 0.85
    vllm_max_model_len: int = 4096
    vllm_enable_lora: bool = True
    vllm_max_loras: int = 2

    # Google API (for Gemini routing comparison)
    google_api_key: str = os.getenv("GOOGLE_API_KEY", "")

    # Routing thresholds
    use_finetuned_for_classification: bool = True
    use_finetuned_for_tone: bool = True

    # Classification labels
    valid_labels: list[str] = [
        "urgent", "newsletter", "client-request",
        "internal", "meeting", "notification", "personal"
    ]


settings = Settings()
