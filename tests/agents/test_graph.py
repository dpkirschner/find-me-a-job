# tests/test_graph.py

from unittest.mock import Mock, patch

import pytest
import requests

from agents.graph import graph, llm_node, stream_graph_events


class TestLLMNode:
    """Unit tests for the llm_node function."""

    @pytest.mark.asyncio
    @patch("agents.graph.ChatOllama")
    async def test_llm_node_returns_reply(self, mock_chat_ollama):
        from unittest.mock import AsyncMock

        mock_llm_instance = AsyncMock()
        mock_response = Mock()
        mock_response.content = "This is a test response"
        mock_llm_instance.ainvoke.return_value = mock_response
        mock_chat_ollama.return_value = mock_llm_instance

        test_state = {"message": "Hello, how are you?", "reply": ""}
        result = await llm_node(test_state)

        assert "reply" in result
        assert result["reply"] == "This is a test response"
        mock_chat_ollama.assert_called_once_with(model="gpt-oss")
        mock_llm_instance.ainvoke.assert_called_once_with("Hello, how are you?")


class TestGraphStructure:
    """Tests for graph compilation and structure."""

    def test_graph_has_correct_nodes(self):
        node_names = list(graph.get_graph().nodes.keys())
        assert "__start__" in node_names
        assert "llm_node" in node_names
        assert "__end__" in node_names

    def test_graph_has_correct_edges(self):
        edges = graph.get_graph().edges
        edge_pairs = [(edge.source, edge.target) for edge in edges]
        assert ("__start__", "llm_node") in edge_pairs
        assert ("llm_node", "__end__") in edge_pairs


class TestStreamGraphEvents:
    """Integration tests for the stream_graph_events function."""

    @pytest.mark.asyncio
    @patch("agents.graph.graph")
    async def test_stream_graph_events_success(self, mock_graph):
        async def mock_event_stream(*args, **kwargs):
            yield {
                "event": "on_chat_model_stream",
                "data": {"chunk": Mock(content="Hello")},
            }
            yield {"event": "other_event", "data": {"chunk": Mock(content="ignored")}}
            yield {
                "event": "on_chat_model_stream",
                "data": {"chunk": Mock(content=" world")},
            }

        mock_graph.astream_events.return_value = mock_event_stream()
        events = [event async for event in stream_graph_events("Hello")]

        assert len(events) == 3  # 2 message events + 1 done event
        assert events[0] == {"event": "message", "data": "Hello"}
        assert events[1] == {"event": "message", "data": " world"}
        assert events[2] == {"event": "done", "data": "[DONE]"}

    @pytest.mark.asyncio
    @patch("agents.graph.graph")
    async def test_stream_graph_events_handles_other_errors(self, mock_graph):
        mock_graph.astream_events.side_effect = ValueError("Graph error")
        events = [event async for event in stream_graph_events("Hello")]

        assert len(events) == 2
        assert events[0]["event"] == "error"
        assert "An error occurred: Graph error" in events[0]["data"]
        assert events[1] == {"event": "done", "data": "[DONE]"}

    @pytest.mark.asyncio
    @patch("agents.graph.graph")
    async def test_stream_graph_events_raises_connection_error(self, mock_graph):
        """NEW: Tests that ConnectionError is raised, not handled."""
        mock_graph.astream_events.side_effect = requests.exceptions.ConnectionError

        with pytest.raises(requests.exceptions.ConnectionError):
            _ = [event async for event in stream_graph_events("Hello")]
