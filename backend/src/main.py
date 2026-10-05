"""FastAPI application for email classification and tone matching.

Serves fine-tuned Mistral-7B via vLLM with continuous batching.
Implements Vertex AI-style model routing: Gemini for simple replies,
fine-tuned model for classification and tone matching.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers.classify import router as classify_router
from .routers.tone import router as tone_router
from .routers.agent import router as agent_router
from .serving.engine import model_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup the vLLM engine."""
    print(f"[startup] Loading base model: {settings.base_model}")
    print(f"[startup] vLLM GPU memory utilization: {settings.vllm_gpu_memory_utilization}")
    print(f"[startup] LoRA adapters enabled: {settings.vllm_enable_lora}")

    # Engine initialization happens lazily on first request
    # to avoid blocking startup if no GPU is available
    yield

    # Cleanup
    print("[shutdown] Cleaning up model engine...")
    model_engine.shutdown()


app = FastAPI(
    title="Email Assistant Backend",
    description="Fine-tuned Mistral-7B for email classification and tone matching",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://email-assistant.example.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(classify_router, prefix="/classify", tags=["classification"])
app.include_router(tone_router, prefix="/tone", tags=["tone"])
app.include_router(agent_router, prefix="/agent", tags=["agent"])


@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes liveness/readiness probes."""
    return {
        "status": "ok",
        "model": settings.base_model,
        "lora_enabled": settings.vllm_enable_lora,
        "engine_loaded": model_engine.is_loaded,
    }


@app.get("/")
async def root():
    return {"service": "email-assistant-backend", "version": "0.1.0"}
