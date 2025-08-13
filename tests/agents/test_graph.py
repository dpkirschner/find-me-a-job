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

        from langchain_core.messages import AIMessage, HumanMessage

        mock_llm_instance = AsyncMock()
        mock_response = AIMessage(content="This is a test response")
        mock_llm_instance.ainvoke.return_value = mock_response
        mock_chat_ollama.return_value = mock_llm_instance

        # Create proper GraphState with messages list and no agent_id
        test_state = {
            "messages": [HumanMessage(content="Hello, how are you?")],
            "agent_id": None,
        }
        result = await llm_node(test_state)

        assert "messages" in result
        assert len(result["messages"]) == 1
        assert result["messages"][0].content == "This is a test response"
        mock_chat_ollama.assert_called_once_with(model="gpt-oss")
        mock_llm_instance.ainvoke.assert_called_once()

    @pytest.mark.asyncio
    @patch("agents.graph.ChatOllama")
    @patch("backend.db.get_agent")
    async def test_llm_node_with_system_prompt(self, mock_get_agent, mock_chat_ollama):
        from unittest.mock import AsyncMock

        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

        # Mock agent with system prompt
        mock_get_agent.return_value = {
            "id": 1,
            "name": "test_agent",
            "system_prompt": "You are a helpful assistant.",
        }

        mock_llm_instance = AsyncMock()
        mock_response = AIMessage(content="I'm here to help!")
        mock_llm_instance.ainvoke.return_value = mock_response
        mock_chat_ollama.return_value = mock_llm_instance

        # Create GraphState with agent_id but no existing system message
        test_state = {"messages": [HumanMessage(content="Hello")], "agent_id": 1}
        result = await llm_node(test_state)

        # Verify system prompt was fetched
        mock_get_agent.assert_called_once_with(1)

        # Verify LLM was called with system message prepended
        call_args = mock_llm_instance.ainvoke.call_args[0][0]  # messages argument
        assert len(call_args) == 2
        assert isinstance(call_args[0], SystemMessage)
        assert call_args[0].content == "You are a helpful assistant."
        assert isinstance(call_args[1], HumanMessage)
        assert call_args[1].content == "Hello"

        assert result["messages"][0].content == "I'm here to help!"

    @pytest.mark.asyncio
    @patch("agents.graph.ChatOllama")
    @patch("backend.db.get_agent")
    async def test_llm_node_with_existing_system_message(
        self, mock_get_agent, mock_chat_ollama
    ):
        from unittest.mock import AsyncMock

        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

        # Mock agent with system prompt
        mock_get_agent.return_value = {
            "id": 1,
            "name": "test_agent",
            "system_prompt": "You are a helpful assistant.",
        }

        mock_llm_instance = AsyncMock()
        mock_response = AIMessage(content="Response")
        mock_llm_instance.ainvoke.return_value = mock_response
        mock_chat_ollama.return_value = mock_llm_instance

        # Create GraphState with agent_id and existing system message
        test_state = {
            "messages": [
                SystemMessage(content="Existing system prompt"),
                HumanMessage(content="Hello"),
            ],
            "agent_id": 1,
        }
        await llm_node(test_state)

        # Verify system prompt was fetched
        mock_get_agent.assert_called_once_with(1)

        # Verify LLM was called with original messages (no additional system message)
        call_args = mock_llm_instance.ainvoke.call_args[0][0]  # messages argument
        assert len(call_args) == 2
        assert isinstance(call_args[0], SystemMessage)
        assert (
            call_args[0].content == "Existing system prompt"
        )  # Original system message preserved
        assert isinstance(call_args[1], HumanMessage)
        assert call_args[1].content == "Hello"

    @pytest.mark.asyncio
    @patch("agents.graph.ChatOllama")
    @patch("backend.db.get_agent")
    async def test_llm_node_agent_not_found(self, mock_get_agent, mock_chat_ollama):
        from unittest.mock import AsyncMock

        from langchain_core.messages import AIMessage, HumanMessage

        # Mock agent not found
        mock_get_agent.return_value = None

        mock_llm_instance = AsyncMock()
        mock_response = AIMessage(content="Response")
        mock_llm_instance.ainvoke.return_value = mock_response
        mock_chat_ollama.return_value = mock_llm_instance

        # Create GraphState with non-existent agent_id
        test_state = {"messages": [HumanMessage(content="Hello")], "agent_id": 999}
        await llm_node(test_state)

        # Verify agent was looked up
        mock_get_agent.assert_called_once_with(999)

        # Verify LLM was called with original messages (no system message added)
        call_args = mock_llm_instance.ainvoke.call_args[0][0]  # messages argument
        assert len(call_args) == 1
        assert isinstance(call_args[0], HumanMessage)
        assert call_args[0].content == "Hello"

    @pytest.mark.asyncio
    @patch("agents.graph.ChatOllama")
    @patch("backend.db.get_agent")
    async def test_llm_node_agent_no_system_prompt(
        self, mock_get_agent, mock_chat_ollama
    ):
        from unittest.mock import AsyncMock

        from langchain_core.messages import AIMessage, HumanMessage

        # Mock agent with no system prompt
        mock_get_agent.return_value = {
            "id": 1,
            "name": "test_agent",
            "system_prompt": None,
        }

        mock_llm_instance = AsyncMock()
        mock_response = AIMessage(content="Response")
        mock_llm_instance.ainvoke.return_value = mock_response
        mock_chat_ollama.return_value = mock_llm_instance

        # Create GraphState with agent that has no system prompt
        test_state = {"messages": [HumanMessage(content="Hello")], "agent_id": 1}
        await llm_node(test_state)

        # Verify agent was looked up
        mock_get_agent.assert_called_once_with(1)

        # Verify LLM was called with original messages (no system message added)
        call_args = mock_llm_instance.ainvoke.call_args[0][0]  # messages argument
        assert len(call_args) == 1
        assert isinstance(call_args[0], HumanMessage)
        assert call_args[0].content == "Hello"


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
        events = [
            event async for event in stream_graph_events("Hello", 1)
        ]  # Now requires agent_id

        assert len(events) == 3  # 2 message events + 1 done event
        assert events[0] == {"event": "message", "data": "Hello"}
        assert events[1] == {"event": "message", "data": " world"}
        assert events[2] == {"event": "done", "data": "[DONE]"}

        # Verify agent_id was passed in initial state
        call_args = mock_graph.astream_events.call_args
        initial_state = call_args[0][0]
        assert initial_state["agent_id"] == 1

    @pytest.mark.asyncio
    @patch("agents.graph.graph")
    async def test_stream_graph_events_handles_other_errors(self, mock_graph):
        mock_graph.astream_events.side_effect = ValueError("Graph error")
        events = [
            event async for event in stream_graph_events("Hello", 1)
        ]  # Now requires agent_id

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
            _ = [
                event async for event in stream_graph_events("Hello", 1)
            ]  # Now requires agent_id

    @pytest.mark.asyncio
    @patch("agents.graph.graph")
    async def test_stream_graph_events_with_historical_messages(self, mock_graph):
        """Test stream_graph_events with historical messages."""
        from langchain_core.messages import AIMessage, HumanMessage

        async def mock_event_stream(*args, **kwargs):
            yield {
                "event": "on_chat_model_stream",
                "data": {"chunk": Mock(content="Response")},
            }

        mock_graph.astream_events.return_value = mock_event_stream()

        # Historical messages
        historical = [
            HumanMessage(content="Previous question"),
            AIMessage(content="Previous answer"),
        ]

        [event async for event in stream_graph_events("New question", 1, historical)]

        # Verify historical messages were included in state
        call_args = mock_graph.astream_events.call_args
        initial_state = call_args[0][0]
        assert initial_state["agent_id"] == 1
        assert len(initial_state["messages"]) == 3  # 2 historical + 1 new
        assert initial_state["messages"][0].content == "Previous question"
        assert initial_state["messages"][1].content == "Previous answer"
        assert initial_state["messages"][2].content == "New question"
