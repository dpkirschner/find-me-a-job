from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient

from agents.graph import stream_graph_events
from backend.app import ChatRequest, app


@pytest.fixture
def client():
    """Create test client for FastAPI app."""
    return TestClient(app)


class TestHealthEndpoint:
    """Tests for the health check endpoint."""

    def test_healthz_returns_ok(self, client):
        """Test that healthz endpoint returns OK status."""
        response = client.get("/healthz")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestStreamGraphEvents:
    """Tests for the stream_graph_events function integration."""

    @pytest.mark.asyncio
    @patch("agents.graph.graph")
    async def test_stream_graph_events_with_valid_message(self, mock_graph):
        """Test streaming with a valid message."""

        # Setup mock events as an async generator
        async def mock_events():
            yield {
                "event": "on_chat_model_stream",
                "data": {"chunk": Mock(content="Hello")},
            }
            yield {
                "event": "on_chat_model_stream",
                "data": {"chunk": Mock(content=" world")},
            }

        mock_graph.astream_events.return_value = mock_events()

        # Execute
        tokens = []
        async for token in stream_graph_events("Test message"):
            tokens.append(token)

        # Assertions
        assert len(tokens) == 3  # 2 content + done event
        assert tokens[0] == {"event": "message", "data": "Hello"}
        assert tokens[1] == {"event": "message", "data": " world"}
        assert tokens[2] == {"event": "done", "data": "[DONE]"}

    @pytest.mark.asyncio
    @patch("agents.graph.graph")
    async def test_stream_graph_events_handles_connection_error(self, mock_graph):
        """Test streaming re-raises connection errors."""
        # Setup mock to raise connection error
        import requests

        mock_graph.astream_events.side_effect = requests.exceptions.ConnectionError(
            "Connection refused"
        )

        # Execute and expect the ConnectionError to be re-raised
        with pytest.raises(requests.exceptions.ConnectionError):
            async for _ in stream_graph_events("Test message"):
                pass


class TestChatEndpoint:
    """Tests for the /chat endpoint."""

    @patch("backend.app.stream_graph_events")
    def test_chat_endpoint_success(self, mock_stream_graph_events, client):
        """Test successful chat endpoint call."""

        # Setup mock async iterator
        async def mock_events():
            yield {"event": "message", "data": "Hello"}
            yield {"event": "message", "data": " there"}
            yield {"event": "done", "data": "[DONE]"}

        mock_stream_graph_events.return_value = mock_events()

        # Execute
        response = client.post("/chat", json={"message": "Hello"})

        # Assertions
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/event-stream; charset=utf-8"

        # Check that the response contains SSE data
        content = response.text
        assert "event: message" in content
        assert "data: Hello" in content
        assert "data:  there" in content
        assert "event: done" in content
        assert "data: [DONE]" in content

        mock_stream_graph_events.assert_called_once_with("Hello")

    def test_chat_endpoint_invalid_request_body(self, client):
        """Test chat endpoint with invalid request body."""
        response = client.post("/chat", json={})

        assert response.status_code == 422  # Validation error

    def test_chat_endpoint_missing_message_field(self, client):
        """Test chat endpoint with missing message field."""
        response = client.post("/chat", json={"wrong_field": "value"})

        assert response.status_code == 422  # Validation error

    @patch("backend.app.stream_graph_events")
    def test_chat_endpoint_returns_503_on_connection_error(
        self, mock_stream_graph_events, client
    ):
        """Test chat endpoint returns 503 when connection fails."""
        import requests as requests_lib

        async def failing_stream():
            if False:
                yield
            raise requests_lib.exceptions.ConnectionError("Connection refused")

        mock_stream_graph_events.return_value = failing_stream()

        # Execute
        response = client.post("/chat", json={"message": "Hello"})

        # Assertions
        assert response.status_code == 503
        assert response.json()["detail"] == "LLM service is unavailable"


class TestChatRequestModel:
    """Tests for the ChatRequest pydantic model."""

    def test_chat_request_valid(self):
        """Test valid ChatRequest creation."""
        request = ChatRequest(message="Hello world")
        assert request.message == "Hello world"

    def test_chat_request_empty_message(self):
        """Test ChatRequest with empty message."""
        request = ChatRequest(message="")
        assert request.message == ""

    def test_chat_request_missing_message(self):
        """Test ChatRequest validation with missing message field."""
        with pytest.raises(ValueError):
            ChatRequest()


class TestCORSConfiguration:
    """Tests for CORS middleware configuration."""

    def test_cors_preflight_request(self, client):
        """Test CORS preflight request."""
        response = client.options(
            "/chat",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

        assert response.status_code == 200
        assert (
            response.headers.get("access-control-allow-origin")
            == "http://localhost:3000"
        )
        assert "POST" in response.headers.get("access-control-allow-methods", "")


class TestAppConfiguration:
    """Tests for FastAPI app configuration."""

    def test_app_title(self):
        """Test that app has correct title."""
        assert app.title == "Find Me A Job API"

    def test_app_has_chat_route(self):
        """Test that app has the chat route configured."""
        routes = [route.path for route in app.routes]
        assert "/chat" in routes
        assert "/healthz" in routes
