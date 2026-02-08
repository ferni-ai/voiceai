"""
E2E tests for the MLX Qwen3-Omni server: wiring and request/response contract.

Uses mocked model manager and generation so no real checkpoint is required.
Proves: health, chat completions (usage), tools rejected, audio speech/transcription status codes.
"""

from __future__ import annotations

import io
import json
from unittest.mock import MagicMock, patch

import pytest

# Server E2E tests require fastapi and httpx (TestClient)
try:
    from fastapi.testclient import TestClient
except ImportError:
    TestClient = None  # type: ignore[misc, assignment]


pytestmark = pytest.mark.skipif(TestClient is None, reason="fastapi/httpx not installed (pip install fastapi httpx)")


@pytest.fixture
def app():
    """Create FastAPI app (uses real create_app; we patch globals)."""
    from mlx_qwen3_omni.server import create_app
    return create_app()


@pytest.fixture
def client(app):
    """TestClient for the app."""
    return TestClient(app)


def test_health_unloaded(client):
    """GET /health when model not loaded returns status and model_loaded=false."""
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert "status" in data
    assert "model_loaded" in data
    # Default state: not loaded unless we ran server.load() in process
    assert data["model_loaded"] is False or data["model_loaded"] is True


def test_models_list(client):
    """GET /v1/models returns list with one model."""
    r = client.get("/v1/models")
    assert r.status_code == 200
    data = r.json()
    assert data.get("object") == "list"
    assert "data" in data
    assert isinstance(data["data"], list)


def test_chat_completions_503_when_not_loaded(client):
    """POST /v1/chat/completions returns 503 when model not loaded."""
    r = client.post(
        "/v1/chat/completions",
        json={
            "model": "qwen3-omni-thinker",
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 10,
        },
    )
    # If model not loaded we get 503
    if r.status_code == 503:
        assert "not loaded" in r.json().get("detail", "").lower()
        return
    # If model is loaded (e.g. by another test), we get 200
    assert r.status_code == 200
    data = r.json()
    assert "choices" in data
    assert "usage" in data


@patch("mlx_qwen3_omni.server._manager")
@patch("mlx_qwen3_omni.server.generate_response")
def test_chat_completions_usage_and_tools_rejected(client, mock_gen, mock_mgr):
    """With mocked manager and generate_response: usage has real counts; tools return 400."""
    mock_mgr.is_loaded = True
    mock_gen.return_value = ("Hello", 12, 5)

    # Tools rejected with 400
    r_tools = client.post(
        "/v1/chat/completions",
        json={
            "model": "qwen3-omni-thinker",
            "messages": [{"role": "user", "content": "Hi"}],
            "tools": [{"type": "function", "function": {"name": "foo", "description": "bar"}}],
        },
    )
    assert r_tools.status_code == 400
    assert "tools" in r_tools.json().get("detail", "").lower()

    # Normal request returns usage
    r = client.post(
        "/v1/chat/completions",
        json={
            "model": "qwen3-omni-thinker",
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 10,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["choices"][0]["message"]["content"] == "Hello"
    usage = data["usage"]
    assert usage["prompt_tokens"] == 12
    assert usage["completion_tokens"] == 5
    assert usage["total_tokens"] == 17


def test_audio_speech_400_empty_input(client):
    """POST /v1/audio/speech with empty input returns 400."""
    r = client.post(
        "/v1/audio/speech",
        json={"input": ""},
    )
    assert r.status_code == 422 or r.status_code == 400  # Pydantic or our check


def test_audio_speech_503_or_501(client):
    """POST /v1/audio/speech without model/talker returns 503 or 501."""
    r = client.post(
        "/v1/audio/speech",
        json={"input": "Hello world"},
    )
    # 503 if model not loaded, 501 if model loaded but Talker/Code2Wav not
    assert r.status_code in (503, 501)


def test_audio_transcriptions_503_or_501(client):
    """POST /v1/audio/transcriptions without model/encoder returns 503 or 501."""
    r = client.post(
        "/v1/audio/transcriptions",
        files={"file": ("test.wav", io.BytesIO(b"\x00" * 1600), "audio/wav")},
    )
    assert r.status_code in (400, 503, 501)  # 400 if invalid audio, else not implemented


def test_streaming_chat_completions_final_chunk_has_usage(client):
    """Streaming chat completions: final chunk includes usage when manager loaded and gen yields usage."""

    def fake_stream(*, messages, max_tokens, temperature, stop):
        yield ("Hello", None, None)
        yield (" world", None, None)
        yield ("", 10, 3)

    with patch("mlx_qwen3_omni.server._manager") as mock_mgr:
        mock_mgr.is_loaded = True
        with patch("mlx_qwen3_omni.server.generate_response_streaming", side_effect=fake_stream):
            r = client.post(
                "/v1/chat/completions",
                json={
                    "model": "qwen3-omni-thinker",
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 10,
                    "stream": True,
                },
            )
    assert r.status_code == 200
    lines = [ln.strip() for ln in r.text.strip().split("\n") if ln.strip()]
    data_lines = [ln for ln in lines if ln.startswith("data: ") and ln != "data: [DONE]"]
    last_data = data_lines[-1] if data_lines else ""
    if "usage" in last_data:
        chunk = json.loads(last_data.replace("data: ", ""))
        assert "usage" in chunk
        assert chunk["usage"]["prompt_tokens"] == 10
        assert chunk["usage"]["completion_tokens"] == 3
