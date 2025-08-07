import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from server.app import app, token_stream, ChatRequest


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


class TestTokenStream:
    """Tests for the token_stream function."""
    
    @pytest.mark.asyncio
    @patch('server.app.run_graph')
    async def test_token_stream_with_valid_message(self, mock_run_graph):
        """Test token streaming with a valid message."""
        # Setup mock
        mock_run_graph.return_value = "Hello world test"
        
        # Execute
        tokens = []
        async for token in token_stream("Test message"):
            tokens.append(token)
        
        # Assertions
        assert len(tokens) == 4  # 3 words + done event
        assert tokens[0] == {"event": "message", "data": "Hello "}
        assert tokens[1] == {"event": "message", "data": "world "}
        assert tokens[2] == {"event": "message", "data": "test "}
        assert tokens[3] == {"event": "done", "data": "[DONE]"}
        
        mock_run_graph.assert_called_once_with("Test message")
    
    @pytest.mark.asyncio
    async def test_token_stream_with_empty_message(self):
        """Test token streaming with empty message raises exception."""
        with pytest.raises(Exception):  # HTTPException
            async for _ in token_stream(""):
                pass
    
    @pytest.mark.asyncio
    @patch('server.app.run_graph')
    async def test_token_stream_handles_graph_error(self, mock_run_graph):
        """Test token streaming handles errors from graph."""
        # Setup mock to raise exception
        mock_run_graph.side_effect = Exception("LLM connection failed")
        
        # Execute
        tokens = []
        async for token in token_stream("Test message"):
            tokens.append(token)
        
        # Assertions
        assert len(tokens) == 2  # error + done event
        assert tokens[0]["event"] == "error"
        assert "Error generating response: LLM connection failed" in tokens[0]["data"]
        assert tokens[1] == {"event": "done", "data": "[DONE]"}


class TestChatEndpoint:
    """Tests for the /chat endpoint."""
    
    @patch('server.app.run_graph')
    def test_chat_endpoint_success(self, mock_run_graph, client):
        """Test successful chat endpoint call."""
        # Setup mock
        mock_run_graph.return_value = "Hello there"
        
        # Execute
        response = client.post(
            "/chat",
            json={"message": "Hello"}
        )
        
        # Assertions
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/event-stream; charset=utf-8"
        
        # Check that the response contains SSE data
        content = response.text
        assert "event: message" in content
        assert "data: Hello " in content
        assert "data: there " in content
        assert "event: done" in content
        assert "data: [DONE]" in content
        
        mock_run_graph.assert_called_once_with("Hello")
    
    def test_chat_endpoint_invalid_request_body(self, client):
        """Test chat endpoint with invalid request body."""
        response = client.post("/chat", json={})
        
        assert response.status_code == 422  # Validation error
    
    def test_chat_endpoint_missing_message_field(self, client):
        """Test chat endpoint with missing message field."""
        response = client.post("/chat", json={"wrong_field": "value"})
        
        assert response.status_code == 422  # Validation error
    
    @patch('server.app.run_graph')
    def test_chat_endpoint_with_graph_error(self, mock_run_graph, client):
        """Test chat endpoint handles graph errors gracefully."""
        # Setup mock to raise exception
        mock_run_graph.side_effect = Exception("Graph error")
        
        # Execute
        response = client.post("/chat", json={"message": "Hello"})
        
        # Assertions
        assert response.status_code == 200
        content = response.text
        assert "event: error" in content
        assert "Graph error" in content
        assert "event: done" in content


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
                "Access-Control-Request-Headers": "content-type"
            }
        )
        
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
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