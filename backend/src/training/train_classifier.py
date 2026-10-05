"""Fine-tune Mistral-7B with QLoRA for email classification.

Uses PEFT (Parameter-Efficient Fine-Tuning) with 4-bit quantization
via bitsandbytes for memory-efficient training on consumer GPUs.

Key hyperparameters:
- Quantization: 4-bit (NF4) via bitsandbytes
- LoRA rank: 16, alpha: 32
- Learning rate: 2e-4
- Epochs: 3
- Batch size: 4 (with gradient accumulation)
"""

import os
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, TaskType, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)
from trl import SFTTrainer, SFTConfig

# ── Configuration ─────────────────────────────────────────────────────────────

BASE_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"
DATA_DIR = Path(__file__).parent.parent.parent / "data"
OUTPUT_DIR = Path(__file__).parent.parent.parent / "adapters" / "classifier"

# QLoRA configuration
QUANT_CONFIG = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

LORA_CONFIG = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,                     # LoRA rank
    lora_alpha=32,            # LoRA scaling factor
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    bias="none",
)


def train():
    """Run QLoRA fine-tuning on the classification dataset."""
    print(f"Loading base model: {BASE_MODEL}")
    print(f"Training data: {DATA_DIR / 'train_classify.jsonl'}")
    print(f"Output: {OUTPUT_DIR}")

    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    # Load model with 4-bit quantization
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        quantization_config=QUANT_CONFIG,
        device_map="auto",
        trust_remote_code=True,
    )

    # Prepare for k-bit training
    model = prepare_model_for_kbit_training(model)
    model = get_peft_model(model, LORA_CONFIG)

    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Trainable: {trainable_params:,} / {total_params:,} ({100 * trainable_params / total_params:.2f}%)")

    # Load dataset
    dataset = load_dataset("json", data_files={
        "train": str(DATA_DIR / "train_classify.jsonl"),
        "test": str(DATA_DIR / "test_classify.jsonl"),
    })

    # Training arguments
    training_args = SFTConfig(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=3,
        per_device_train_batch_size=4,
        gradient_accumulation_steps=4,
        learning_rate=2e-4,
        weight_decay=0.01,
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
        logging_steps=10,
        save_strategy="epoch",
        evaluation_strategy="epoch",
        fp16=True,
        optim="paged_adamw_8bit",
        max_seq_length=2048,
        report_to="none",
    )

    # Initialize trainer
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset["train"],
        eval_dataset=dataset["test"],
        tokenizer=tokenizer,
    )

    # Train
    print("Starting QLoRA fine-tuning...")
    trainer.train()

    # Save the LoRA adapter
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    trainer.model.save_pretrained(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))
    print(f"Adapter saved to {OUTPUT_DIR}")


if __name__ == "__main__":
    train()
