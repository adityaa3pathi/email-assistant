"""Tests for the classification endpoint."""

import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_classify_email():
    response = client.post("/classify/", json={
        "sender": "john@company.com",
        "subject": "URGENT: Server down",
        "body_snippet": "The production server is down and needs immediate attention.",
        "use_finetuned": False,  # Use Gemini fallback for CI
    })
    assert response.status_code == 200
    data = response.json()
    assert "labels" in data
    assert "model_used" in data
    assert isinstance(data["labels"], list)


def test_classify_newsletter():
    response = client.post("/classify/", json={
        "sender": "newsletter@medium.com",
        "subject": "Weekly Digest: Top Stories",
        "body_snippet": "Here are the top stories from this week...",
        "use_finetuned": False,
    })
    assert response.status_code == 200
    data = response.json()
    assert "newsletter" in data["labels"] or len(data["labels"]) > 0


def test_tone_matching():
    response = client.post("/tone/", json={
        "email_thread": [
            {"from": "alice@company.com", "body": "Hi, can we discuss the project timeline?"}
        ],
        "past_sent_emails": [
            {"subject": "Re: Project Update", "body": "Hey Alice, sure thing! Let's chat tomorrow."}
        ],
        "reply_instructions": "Agree to meet and suggest Thursday",
        "desired_tone": "casual",
    })
    assert response.status_code == 200
    data = response.json()
    assert "draft" in data
    assert "model_used" in data
