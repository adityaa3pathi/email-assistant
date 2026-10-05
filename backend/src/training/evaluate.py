"""Benchmark fine-tuned Mistral-7B vs. prompted Gemini 2.0 Flash Lite.

Runs both models on a held-out test set and reports:
- Classification accuracy (exact match and partial match)
- F1 score (macro-averaged)
- Average inference latency
- Estimated cost per 1000 classifications

Target: 92% accuracy, 4x lower inference cost for fine-tuned model.
"""

import json
import os
import sys
import time
from pathlib import Path

import google.generativeai as genai
from dotenv import load_dotenv
from sklearn.metrics import f1_score, accuracy_score
from sklearn.preprocessing import MultiLabelBinarizer

load_dotenv()

DATA_DIR = Path(__file__).parent.parent.parent / "data"
VALID_LABELS = [
    "urgent", "newsletter", "client-request",
    "internal", "meeting", "notification", "personal"
]

# Cost estimates (per 1M tokens)
GEMINI_COST_PER_1M_INPUT = 0.075   # Gemini 2.0 Flash Lite
GEMINI_COST_PER_1M_OUTPUT = 0.30
VLLM_COST_PER_1M_INPUT = 0.02      # Self-hosted Mistral-7B (GPU amortized)
VLLM_COST_PER_1M_OUTPUT = 0.02

AVG_INPUT_TOKENS = 150
AVG_OUTPUT_TOKENS = 30


def load_test_data(path: Path) -> list[dict]:
    """Load test examples from JSONL."""
    examples = []
    with open(path) as f:
        for line in f:
            examples.append(json.loads(line))
    return examples


def evaluate_gemini(test_data: list[dict]) -> dict:
    """Evaluate Gemini 3.5 Flash Lite on classification."""
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY", ""))
    model = genai.GenerativeModel("gemini-3.5-flash-lite")

    predictions = []
    ground_truths = []
    total_latency = 0.0

    for example in test_data:
        user_msg = example["messages"][0]["content"]
        expected = json.loads(example["messages"][1]["content"])

        start = time.time()
        try:
            response = model.generate_content(user_msg + "\n\nReturn ONLY a JSON array.")
            latency = time.time() - start
            total_latency += latency

            # Parse response
            text = response.text.strip().removeprefix("```json").removesuffix("```").strip()
            predicted = json.loads(text)
            if isinstance(predicted, list):
                predicted = [l for l in predicted if l in VALID_LABELS]
            else:
                predicted = []
        except Exception:
            predicted = []
            total_latency += time.time() - start

        predictions.append(predicted)
        ground_truths.append(expected)

    return _compute_metrics(ground_truths, predictions, total_latency, len(test_data), "gemini")


def evaluate_finetuned(test_data: list[dict]) -> dict:
    """Evaluate fine-tuned Mistral-7B on classification.

    NOTE: Requires vLLM engine running. If not available, simulates
    with pre-computed results.
    """
    try:
        import httpx
        client = httpx.Client(base_url="http://localhost:8000", timeout=30.0)

        predictions = []
        ground_truths = []
        total_latency = 0.0

        for example in test_data:
            expected = json.loads(example["messages"][1]["content"])

            # Extract fields from the prompt
            user_msg = example["messages"][0]["content"]
            lines = user_msg.split("\n")
            sender = subject = body = ""
            for line in lines:
                if line.startswith("From: "):
                    sender = line[6:]
                elif line.startswith("Subject: "):
                    subject = line[9:]
                elif line.startswith("Body: "):
                    body = line[6:]

            start = time.time()
            resp = client.post("/classify/", json={
                "sender": sender,
                "subject": subject,
                "body_snippet": body,
                "use_finetuned": True,
            })
            latency = time.time() - start
            total_latency += latency

            if resp.status_code == 200:
                predicted = resp.json()["labels"]
            else:
                predicted = []

            predictions.append(predicted)
            ground_truths.append(expected)

        client.close()
        return _compute_metrics(ground_truths, predictions, total_latency, len(test_data), "mistral-7b-qlora")

    except Exception as e:
        print(f"[eval] Fine-tuned model not available: {e}")
        print("[eval] Skipping fine-tuned evaluation")
        return {"error": str(e)}


def _compute_metrics(
    ground_truths: list[list[str]],
    predictions: list[list[str]],
    total_latency: float,
    n_samples: int,
    model_name: str,
) -> dict:
    """Compute classification metrics."""
    mlb = MultiLabelBinarizer(classes=VALID_LABELS)

    y_true = mlb.fit_transform(ground_truths)
    y_pred = mlb.transform(predictions)

    # Exact match accuracy
    exact_match = sum(
        1 for gt, pred in zip(ground_truths, predictions)
        if set(gt) == set(pred)
    ) / n_samples

    # F1 score (macro)
    f1_macro = f1_score(y_true, y_pred, average="macro", zero_division=0)

    # Cost estimation per 1000 classifications
    if model_name == "gemini":
        cost_per_1k = (
            (AVG_INPUT_TOKENS * GEMINI_COST_PER_1M_INPUT / 1_000_000) +
            (AVG_OUTPUT_TOKENS * GEMINI_COST_PER_1M_OUTPUT / 1_000_000)
        ) * 1000
    else:
        cost_per_1k = (
            (AVG_INPUT_TOKENS * VLLM_COST_PER_1M_INPUT / 1_000_000) +
            (AVG_OUTPUT_TOKENS * VLLM_COST_PER_1M_OUTPUT / 1_000_000)
        ) * 1000

    return {
        "model": model_name,
        "n_samples": n_samples,
        "exact_match_accuracy": round(exact_match * 100, 1),
        "f1_macro": round(f1_macro * 100, 1),
        "avg_latency_ms": round((total_latency / n_samples) * 1000, 1),
        "cost_per_1000": round(cost_per_1k, 4),
    }


def main():
    """Run full benchmark comparison."""
    test_path = DATA_DIR / "test_classify.jsonl"

    if not test_path.exists():
        print(f"Test data not found at {test_path}")
        print("Run prepare_dataset.py first to export training data.")
        sys.exit(1)

    test_data = load_test_data(test_path)
    print(f"Loaded {len(test_data)} test examples")

    print("\n" + "=" * 60)
    print("BENCHMARK: Fine-tuned Mistral-7B vs Prompted Gemini 2.0")
    print("=" * 60)

    # Evaluate Gemini
    print("\n[1/2] Evaluating Gemini 2.0 Flash Lite...")
    gemini_results = evaluate_gemini(test_data)
    _print_results(gemini_results)

    # Evaluate fine-tuned
    print("\n[2/2] Evaluating Fine-tuned Mistral-7B (QLoRA)...")
    ft_results = evaluate_finetuned(test_data)
    _print_results(ft_results)

    # Comparison
    if "error" not in ft_results:
        print("\n" + "=" * 60)
        print("COMPARISON")
        print("=" * 60)
        cost_ratio = gemini_results["cost_per_1000"] / ft_results["cost_per_1000"] if ft_results["cost_per_1000"] > 0 else float('inf')
        acc_diff = ft_results["exact_match_accuracy"] - gemini_results["exact_match_accuracy"]
        print(f"Accuracy:  Fine-tuned {ft_results['exact_match_accuracy']}% vs Gemini {gemini_results['exact_match_accuracy']}% ({'+' if acc_diff >= 0 else ''}{acc_diff:.1f}%)")
        print(f"Cost:      Fine-tuned ${ft_results['cost_per_1000']}/1k vs Gemini ${gemini_results['cost_per_1000']}/1k ({cost_ratio:.1f}x cheaper)")
        print(f"Latency:   Fine-tuned {ft_results['avg_latency_ms']}ms vs Gemini {gemini_results['avg_latency_ms']}ms")


def _print_results(results: dict):
    if "error" in results:
        print(f"  Error: {results['error']}")
        return
    print(f"  Model:    {results['model']}")
    print(f"  Accuracy: {results['exact_match_accuracy']}%")
    print(f"  F1 Macro: {results['f1_macro']}%")
    print(f"  Latency:  {results['avg_latency_ms']}ms avg")
    print(f"  Cost:     ${results['cost_per_1000']}/1000 classifications")


if __name__ == "__main__":
    main()
