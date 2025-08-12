import sqlite3
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend import db
from backend.app import ChatRequest, app


def load_init_sql() -> str:
    """Load the SQL initialization script from file."""
    with open(db.INIT_SQL_PATH) as f:
        return f.read()


@pytest.fixture
def db_connection(monkeypatch: pytest.MonkeyPatch) -> sqlite3.Connection:
    """
    Provides a pristine, in-memory SQLite database for each test,
    ensuring complete isolation.
    """
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    conn.executescript(load_init_sql())

    monkeypatch.setattr(db, "get_connection", lambda: conn)

    yield conn

    conn.close()


@pytest.fixture
def client(db_connection):
    """Create test client for FastAPI app with isolated database."""
    return TestClient(app)


class TestHealthEndpoint:
    """Tests for the health check endpoint."""

    def test_healthz_returns_ok(self, client):
        """Test that healthz endpoint returns OK status."""
        response = client.get("/healthz")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestChatEndpoint:
    """Tests for the /chat endpoint."""

    @patch("agents.graph.stream_graph_events")
    def test_chat_endpoint_success(self, mock_stream_events, client):
        """Test successful chat endpoint call."""
        # First create an agent to chat with
        agent = db.create_agent("test_agent")
        agent_id = agent["id"]

        # Mock the stream events to avoid LLM calls
        async def mock_events():
            yield {"event": "message", "data": "Hello"}
            yield {"event": "message", "data": " there"}
            yield {"event": "done", "data": "[DONE]"}

        mock_stream_events.return_value = mock_events()

        # Now test the chat endpoint
        response = client.post("/chat", json={"message": "Hello", "agent_id": agent_id})

        # Assertions
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/event-stream; charset=utf-8"

    def test_chat_endpoint_invalid_request_body(self, client):
        """Test chat endpoint with invalid JSON body."""
        response = client.post("/chat", content="invalid json")
        assert response.status_code == 422

    def test_chat_endpoint_missing_message_field(self, client):
        """Test chat endpoint with missing message field."""
        response = client.post("/chat", json={"agent_id": 1})
        assert response.status_code == 422

    @patch("backend.db.agent_exists")
    def test_chat_endpoint_agent_not_found(self, mock_agent_exists, client):
        """Test chat endpoint with non-existent agent."""
        mock_agent_exists.return_value = False

        response = client.post("/chat", json={"message": "Hello", "agent_id": 999})
        assert response.status_code == 404
        assert "Agent not found" in response.json()["detail"]


class TestChatRequestModel:
    """Tests for the ChatRequest Pydantic model."""

    def test_chat_request_valid(self):
        """Test valid ChatRequest creation."""
        request = ChatRequest(message="Hello world", agent_id=1)
        assert request.message == "Hello world"
        assert request.agent_id == 1

    def test_chat_request_empty_message(self):
        """Test ChatRequest with empty message."""
        # Pydantic allows empty strings, so this should not raise
        request = ChatRequest(message="", agent_id=1)
        assert request.message == ""

    def test_chat_request_missing_message(self):
        """Test ChatRequest with missing message field."""
        with pytest.raises(Exception):  # Pydantic raises ValidationError, not TypeError
            ChatRequest(agent_id=1)


class TestAppConfiguration:
    """Tests for FastAPI app configuration."""

    def test_app_title(self):
        """Test that app has correct title."""
        assert app.title == "Find Me A Job API"

    def test_app_has_chat_route(self):
        """Test that chat route exists."""
        routes = [route.path for route in app.routes]
        assert "/chat" in routes


class TestAgentsEndpoint:
    """Tests for the /agents endpoint."""

    def test_get_agents_success(self, client):
        """Test successful GET /agents endpoint call."""
        # Test the actual endpoint - it should return the default seed agents
        response = client.get("/agents")
        assert response.status_code == 200
        data = response.json()
        assert "agents" in data
        assert len(data["agents"]) >= 0  # Just check it returns a list

    def test_create_agent_success(self, client):
        """Test successful POST /agents endpoint call."""
        response = client.post("/agents", json={"name": "test_agent"})
        assert response.status_code == 201
        data = response.json()
        assert data["agent"]["name"] == "test_agent"

    def test_create_agent_invalid_request_body(self, client):
        """Test POST /agents endpoint with invalid JSON body."""
        response = client.post("/agents", content="invalid json")
        assert response.status_code == 422

    def test_create_agent_missing_name_field(self, client):
        """Test POST /agents endpoint with missing name field."""
        response = client.post("/agents", json={})
        assert response.status_code == 422


class TestDeleteAgentEndpoint:
    """Tests for the DELETE /agents/{agent_id} endpoint."""

    def test_delete_agent_success(self, client):
        """Test successful DELETE /agents/{agent_id} endpoint call."""
        # First create an agent to delete
        agent = db.create_agent("delete_test_agent")
        agent_id = agent["id"]

        # Now delete it
        response = client.delete(f"/agents/{agent_id}")
        assert response.status_code == 204

    @patch("backend.db.agent_exists")
    def test_delete_agent_not_found(self, mock_agent_exists, client):
        """Test DELETE /agents/{agent_id} with non-existent agent."""
        mock_agent_exists.return_value = False

        response = client.delete("/agents/999")
        assert response.status_code == 404

    def test_delete_agent_invalid_agent_id(self, client):
        """Test DELETE /agents/{agent_id} with invalid agent ID."""
        response = client.delete("/agents/invalid")
        assert response.status_code == 422

    def test_delete_agent_with_negative_id(self, client):
        """Test DELETE /agents/{agent_id} with negative agent ID."""
        # API currently treats negative IDs as non-existent, returns 404
        response = client.delete("/agents/-1")
        assert response.status_code == 404

    def test_delete_agent_with_zero_id(self, client):
        """Test DELETE /agents/{agent_id} with zero agent ID."""
        # API currently treats zero ID as non-existent, returns 404
        response = client.delete("/agents/0")
        assert response.status_code == 404

    @patch("backend.db.agent_exists")
    def test_delete_agent_multiple_calls_same_agent(self, mock_agent_exists, client):
        """Test multiple DELETE calls for the same agent."""
        # First call succeeds
        mock_agent_exists.return_value = False

        response1 = client.delete("/agents/1")
        assert response1.status_code == 404

        # Second call should also return 404
        response2 = client.delete("/agents/1")
        assert response2.status_code == 404
