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


class TestAgentsEndpoint:
    """Tests for the /agents endpoint."""

    @patch("backend.app.list_agents")
    def test_get_agents_success(self, mock_list_agents, client):
        """Test successful GET /agents endpoint call."""
        # Setup mock return data
        mock_list_agents.return_value = [
            {"id": 1, "name": "job_searcher"},
            {"id": 2, "name": "resume_builder"},
        ]

        # Execute
        response = client.get("/agents")

        # Assertions
        assert response.status_code == 200
        json_response = response.json()
        assert "agents" in json_response
        assert len(json_response["agents"]) == 2

        # Validate the structure matches the Pydantic model
        agents = json_response["agents"]
        assert agents[0]["id"] == 1
        assert agents[0]["name"] == "job_searcher"
        assert agents[1]["id"] == 2
        assert agents[1]["name"] == "resume_builder"

        # Verify the DB function was called
        mock_list_agents.assert_called_once()

    @patch("backend.app.list_agents")
    def test_get_agents_database_error(self, mock_list_agents, client):
        """Test GET /agents endpoint handles database errors."""
        # Setup mock to raise exception
        mock_list_agents.side_effect = Exception("Database connection failed")

        # Execute
        response = client.get("/agents")

        # Assertions
        assert response.status_code == 500
        assert response.json()["detail"] == "Failed to fetch agents"
        mock_list_agents.assert_called_once()

    @patch("backend.app.list_agents")
    def test_get_agents_empty_list(self, mock_list_agents, client):
        """Test GET /agents endpoint with empty agent list."""
        # Setup mock return data
        mock_list_agents.return_value = []

        # Execute
        response = client.get("/agents")

        # Assertions
        assert response.status_code == 200
        json_response = response.json()
        assert "agents" in json_response
        assert len(json_response["agents"]) == 0
        mock_list_agents.assert_called_once()

    @patch("backend.app.create_agent")
    def test_create_agent_success(self, mock_create_agent, client):
        """Test successful POST /agents endpoint call."""
        # Setup mock return data
        mock_create_agent.return_value = {"id": 3, "name": "new_agent"}

        # Execute
        response = client.post("/agents", json={"name": "new_agent"})

        # Assertions
        assert response.status_code == 201
        json_response = response.json()
        assert "agent" in json_response

        # Validate the structure matches the Pydantic model
        agent = json_response["agent"]
        assert agent["id"] == 3
        assert agent["name"] == "new_agent"

        # Verify the DB function was called with correct name
        mock_create_agent.assert_called_once_with("new_agent")

    @patch("backend.app.create_agent")
    def test_create_agent_database_error(self, mock_create_agent, client):
        """Test POST /agents endpoint handles database errors."""
        # Setup mock to raise exception
        mock_create_agent.side_effect = Exception("Database connection failed")

        # Execute
        response = client.post("/agents", json={"name": "failing_agent"})

        # Assertions
        assert response.status_code == 500
        assert response.json()["detail"] == "Failed to create agent"
        mock_create_agent.assert_called_once_with("failing_agent")

    def test_create_agent_invalid_request_body(self, client):
        """Test POST /agents endpoint with invalid request body."""
        response = client.post("/agents", json={})

        assert response.status_code == 422  # Validation error

    def test_create_agent_missing_name_field(self, client):
        """Test POST /agents endpoint with missing name field."""
        response = client.post("/agents", json={"wrong_field": "value"})

        assert response.status_code == 422  # Validation error

    @patch("backend.app.create_agent")
    def test_create_agent_empty_name(self, mock_create_agent, client):
        """Test POST /agents endpoint with empty name."""
        # Setup mock return data - empty name should be allowed
        mock_create_agent.return_value = {"id": 4, "name": ""}

        response = client.post("/agents", json={"name": ""})

        # Note: This should still be valid as per the current Pydantic model
        # If you want to add validation for non-empty names, you'd need to modify the model
        assert response.status_code == 201
        json_response = response.json()
        assert json_response["agent"]["id"] == 4
        assert json_response["agent"]["name"] == ""
        mock_create_agent.assert_called_once_with("")


class TestAgentMessagesEndpoint:
    """Tests for the /agents/{agent_id}/messages endpoint."""

    @patch("backend.app.list_messages")
    @patch("backend.app.agent_exists")
    def test_get_agent_messages_success(
        self, mock_agent_exists, mock_list_messages, client
    ):
        """Test successful GET /agents/{agent_id}/messages endpoint call."""
        # Setup mock return data
        mock_agent_exists.return_value = True  # Agent exists
        mock_list_messages.return_value = [
            {
                "id": 1,
                "agent_id": 1,
                "role": "user",
                "content": "Find me a job in tech",
                "created_at": "2024-01-01T12:00:00",
            },
            {
                "id": 2,
                "agent_id": 1,
                "role": "assistant",
                "content": "I'll help you find tech jobs",
                "created_at": "2024-01-01T12:01:00",
            },
        ]

        # Execute
        agent_id = 1
        response = client.get(f"/agents/{agent_id}/messages")

        # Assertions
        assert response.status_code == 200
        json_response = response.json()
        assert "messages" in json_response
        assert len(json_response["messages"]) == 2

        # Validate the structure matches the Pydantic model
        messages = json_response["messages"]
        assert messages[0]["id"] == 1
        assert messages[0]["agent_id"] == 1
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "Find me a job in tech"
        assert messages[0]["created_at"] == "2024-01-01T12:00:00"

        assert messages[1]["id"] == 2
        assert messages[1]["agent_id"] == 1
        assert messages[1]["role"] == "assistant"
        assert messages[1]["content"] == "I'll help you find tech jobs"

        # Verify the DB functions were called with correct agent_id
        mock_agent_exists.assert_called_once_with(agent_id)
        mock_list_messages.assert_called_once_with(agent_id)

    @patch("backend.app.list_messages")
    @patch("backend.app.agent_exists")
    def test_get_agent_messages_database_error(
        self, mock_agent_exists, mock_list_messages, client
    ):
        """Test GET /agents/{agent_id}/messages endpoint handles database errors."""
        # Setup mock to raise exception
        mock_agent_exists.return_value = True  # Agent exists
        mock_list_messages.side_effect = Exception("Database connection failed")

        # Execute
        agent_id = 1
        response = client.get(f"/agents/{agent_id}/messages")

        # Assertions
        assert response.status_code == 500
        assert response.json()["detail"] == "Failed to fetch messages"
        mock_agent_exists.assert_called_once_with(agent_id)
        mock_list_messages.assert_called_once_with(agent_id)

    @patch("backend.app.list_messages")
    @patch("backend.app.agent_exists")
    def test_get_agent_messages_empty_list(
        self, mock_agent_exists, mock_list_messages, client
    ):
        """Test GET /agents/{agent_id}/messages endpoint with no messages."""
        # Setup mock return data
        mock_agent_exists.return_value = True  # Agent exists
        mock_list_messages.return_value = []

        # Execute
        agent_id = 999
        response = client.get(f"/agents/{agent_id}/messages")

        # Assertions
        assert response.status_code == 200
        json_response = response.json()
        assert "messages" in json_response
        assert len(json_response["messages"]) == 0
        mock_agent_exists.assert_called_once_with(agent_id)
        mock_list_messages.assert_called_once_with(agent_id)

    def test_get_agent_messages_invalid_agent_id(self, client):
        """Test GET /agents/{agent_id}/messages endpoint with invalid agent_id."""
        # Execute with non-integer agent_id
        response = client.get("/agents/invalid/messages")

        # Assertions
        assert response.status_code == 422  # Validation error

    @patch("backend.app.agent_exists")
    def test_get_agent_messages_nonexistent_agent(self, mock_agent_exists, client):
        """Test GET /agents/{agent_id}/messages endpoint with non-existent agent."""
        # Setup mock to return False (agent doesn't exist)
        mock_agent_exists.return_value = False

        # Execute with valid integer but non-existent agent_id
        response = client.get("/agents/999/messages")

        # Assertions
        assert response.status_code == 404
        json_response = response.json()
        assert json_response["detail"] == "Agent not found"
        mock_agent_exists.assert_called_once_with(999)
