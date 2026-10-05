"""vLLM engine wrapper for serving fine-tuned Mistral-7B.

Configured with continuous batching for efficient multi-request inference.
Supports dynamic LoRA adapter loading for classification and tone tasks.
"""

import os
from typing import Optional

from ..config import settings


class ModelEngine:
    """Wrapper around vLLM's AsyncLLMEngine for serving fine-tuned models.

    Supports:
    - Continuous batching for efficient GPU utilization
    - Dynamic LoRA adapter switching between classification and tone tasks
    - Graceful fallback when GPU is not available
    """

    def __init__(self):
        self._engine = None
        self._loaded = False
        self._adapters: dict[str, str] = {}

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def _init_engine(self):
        """Initialize the vLLM engine lazily on first request."""
        if self._loaded:
            return

        try:
            from vllm import AsyncLLMEngine, AsyncEngineArgs, LoRARequest

            engine_args = AsyncEngineArgs(
                model=settings.base_model,
                gpu_memory_utilization=settings.vllm_gpu_memory_utilization,
                max_model_len=settings.vllm_max_model_len,
                enable_lora=settings.vllm_enable_lora,
                max_loras=settings.vllm_max_loras,
                trust_remote_code=True,
                quantization="bitsandbytes",  # 4-bit quantization
                load_format="bitsandbytes",
            )

            self._engine = AsyncLLMEngine.from_engine_args(engine_args)
            self._loaded = True

            # Register LoRA adapters
            if os.path.exists(settings.classifier_adapter):
                self._adapters["classifier"] = settings.classifier_adapter
                print(f"[engine] Registered classifier adapter: {settings.classifier_adapter}")

            if os.path.exists(settings.tone_adapter):
                self._adapters["tone"] = settings.tone_adapter
                print(f"[engine] Registered tone adapter: {settings.tone_adapter}")

            print(f"[engine] vLLM engine initialized with {settings.base_model}")

        except Exception as e:
            print(f"[engine] Failed to initialize vLLM engine: {e}")
            print("[engine] Running in fallback mode (Gemini only)")
            self._loaded = False

    async def generate(
        self,
        prompt: str,
        adapter_name: Optional[str] = None,
        max_tokens: int = 256,
        temperature: float = 0.1,
    ) -> str:
        """Generate text using the vLLM engine with optional LoRA adapter.

        Args:
            prompt: The input prompt
            adapter_name: Name of the LoRA adapter to use ("classifier" or "tone")
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature

        Returns:
            Generated text string
        """
        self._init_engine()

        if not self._loaded or self._engine is None:
            raise RuntimeError("Model engine not available. Use Gemini fallback.")

        from vllm import SamplingParams, LoRARequest

        sampling_params = SamplingParams(
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=0.95,
        )

        # Build LoRA request if adapter specified
        lora_request = None
        if adapter_name and adapter_name in self._adapters:
            lora_request = LoRARequest(
                lora_name=adapter_name,
                lora_int_id=hash(adapter_name) % (2**31),
                lora_local_path=self._adapters[adapter_name],
            )

        # Generate using vLLM's async engine
        request_id = f"req-{id(prompt)}"
        results_generator = self._engine.generate(
            prompt, sampling_params, request_id, lora_request=lora_request
        )

        final_output = None
        async for output in results_generator:
            final_output = output

        if final_output and final_output.outputs:
            return final_output.outputs[0].text

        return ""

    def shutdown(self):
        """Cleanup engine resources."""
        if self._engine:
            del self._engine
            self._engine = None
            self._loaded = False
            print("[engine] Engine shut down")


# Singleton engine instance
model_engine = ModelEngine()
