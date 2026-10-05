"""Export labeled emails from PostgreSQL into training JSONL format.

Pulls emails with their AI-assigned labels from the database and formats
them for QLoRA fine-tuning of the Mistral-7B classifier.
"""

import json
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

OUTPUT_DIR = Path(__file__).parent.parent.parent / "data"


def export_classification_data(db_url: str, output_path: Path):
    """Export classified threads as training data.

    Format: {"messages": [{"role": "user", "content": ...}, {"role": "assistant", "content": ...}]}
    """
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute("""
        SELECT t.subject, t."aiLabels", e."bodySnippet",
               ea.name AS sender_name, ea.address AS sender_address
        FROM "Thread" t
        JOIN "Email" e ON e."threadId" = t.id
        JOIN "EmailAddress" ea ON ea.id = e."fromId"
        WHERE t."aiLabels" != '{}'
        AND e."sentAt" = (
            SELECT MAX(e2."sentAt") FROM "Email" e2 WHERE e2."threadId" = t.id
        )
        ORDER BY t."lastMessageDate" DESC
    """)

    rows = cur.fetchall()
    print(f"Found {len(rows)} labeled threads")

    examples = []
    for subject, labels, body_snippet, sender_name, sender_addr in rows:
        sender = f"{sender_name} <{sender_addr}>" if sender_name else sender_addr

        user_content = (
            f"Classify this email into one or more categories.\n"
            f"Valid categories: urgent, newsletter, client-request, internal, "
            f"meeting, notification, personal\n\n"
            f"From: {sender}\nSubject: {subject}\nBody: {body_snippet or ''}"
        )

        examples.append({
            "messages": [
                {"role": "user", "content": user_content},
                {"role": "assistant", "content": json.dumps(labels)},
            ]
        })

    cur.close()
    conn.close()

    # Split 90/10 train/test
    split_idx = int(len(examples) * 0.9)
    train_data = examples[:split_idx]
    test_data = examples[split_idx:]

    output_path.mkdir(parents=True, exist_ok=True)

    with open(output_path / "train_classify.jsonl", "w") as f:
        for ex in train_data:
            f.write(json.dumps(ex) + "\n")

    with open(output_path / "test_classify.jsonl", "w") as f:
        for ex in test_data:
            f.write(json.dumps(ex) + "\n")

    print(f"Exported {len(train_data)} train, {len(test_data)} test examples")
    print(f"Saved to {output_path}")


if __name__ == "__main__":
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)
    export_classification_data(db_url, OUTPUT_DIR)
