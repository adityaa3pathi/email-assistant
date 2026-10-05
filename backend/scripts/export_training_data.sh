#!/usr/bin/env bash
# Export labeled emails from PostgreSQL for fine-tuning
set -euo pipefail

cd "$(dirname "$0")/.."  # cd to backend/

echo "Exporting training data from PostgreSQL..."
python -m src.training.prepare_dataset

echo ""
echo "Training data exported to data/"
ls -la data/
