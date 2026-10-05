#!/usr/bin/env bash
# Run the evaluation benchmark comparing fine-tuned Mistral vs Gemini
set -euo pipefail

cd "$(dirname "$0")/.."  # cd to backend/

echo "Running benchmark: Fine-tuned Mistral-7B vs Prompted Gemini 2.0"
echo ""
python -m src.training.evaluate
