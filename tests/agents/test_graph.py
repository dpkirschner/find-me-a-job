import pytest
from unittest.mock import Mock, patch
from agents.graph import State, llm_node, graph, run_graph


class TestLLMNode:
    """Unit tests for the llm_node function."""
    
    @patch('agents.graph.ChatOllama')
    def test_llm_node_returns_reply(self, mock_chat_ollama):
        # Setup mock
        mock_llm_instance = Mock()
        mock_response = Mock()
        mock_response.content = "This is a test response"
        mock_llm_instance.invoke.return_value = mock_response
        mock_chat_ollama.return_value = mock_llm_instance
        
        # Test input
        test_state = {"message": "Hello, how are you?", "reply": ""}
        
        # Execute
        result = llm_node(test_state)
        
        # Assertions
        assert "reply" in result
        assert result["reply"] == "This is a test response"
        mock_chat_ollama.assert_called_once_with(model="gpt-oss")
        mock_llm_instance.invoke.assert_called_once_with([{"role": "user", "content": "Hello, how are you?"}])
    
    @patch('agents.graph.ChatOllama')
    def test_llm_node_handles_empty_message(self, mock_chat_ollama):
        # Setup mock
        mock_llm_instance = Mock()
        mock_response = Mock()
        mock_response.content = "I'm here to help!"
        mock_llm_instance.invoke.return_value = mock_response
        mock_chat_ollama.return_value = mock_llm_instance
        
        # Test input
        test_state = {"message": "", "reply": ""}
        
        # Execute
        result = llm_node(test_state)
        
        # Assertions
        assert result["reply"] == "I'm here to help!"
        mock_llm_instance.invoke.assert_called_once_with([{"role": "user", "content": ""}])


class TestGraphStructure:
    """Tests for graph compilation and structure."""
    
    def test_graph_compiles_successfully(self):
        """Test that the graph compiles without errors."""
        assert graph is not None
        
    def test_graph_has_correct_nodes(self):
        """Test that the graph contains the expected nodes."""
        graph_dict = graph.get_graph()
        node_names = list(graph_dict.nodes.keys())
        
        # Should have START, llm_node, and END
        assert "__start__" in node_names
        assert "llm_node" in node_names
        assert "__end__" in node_names
        
    def test_graph_has_correct_edges(self):
        """Test that the graph has the expected edges."""
        graph_dict = graph.get_graph()
        
        # Check edges exist in the graph structure
        edges = graph_dict.edges
        edge_pairs = [(edge.source, edge.target) for edge in edges]
        
        # Should have START -> llm_node -> END
        assert ("__start__", "llm_node") in edge_pairs
        assert ("llm_node", "__end__") in edge_pairs


class TestRunGraph:
    """Integration tests for the run_graph function."""
    
    @patch('agents.graph.ChatOllama')
    def test_run_graph_end_to_end(self, mock_chat_ollama):
        # Setup mock
        mock_llm_instance = Mock()
        mock_response = Mock()
        mock_response.content = "Hello! I'm doing well, thank you for asking."
        mock_llm_instance.invoke.return_value = mock_response
        mock_chat_ollama.return_value = mock_llm_instance
        
        # Execute
        result = run_graph("Hello, how are you?")
        
        # Assertions
        assert result == "Hello! I'm doing well, thank you for asking."
        mock_chat_ollama.assert_called_once_with(model="gpt-oss")
        
    @patch('agents.graph.ChatOllama')
    def test_run_graph_with_different_messages(self, mock_chat_ollama):
        # Setup mock
        mock_llm_instance = Mock()
        mock_response = Mock()
        mock_response.content = "42"
        mock_llm_instance.invoke.return_value = mock_response
        mock_chat_ollama.return_value = mock_llm_instance
        
        # Execute
        result = run_graph("What is the meaning of life?")
        
        # Assertions
        assert result == "42"
        mock_llm_instance.invoke.assert_called_once_with([{"role": "user", "content": "What is the meaning of life?"}])


class TestStateType:
    """Tests for the State TypedDict."""
    
    def test_state_has_required_fields(self):
        """Test that State type has the expected structure."""
        test_state: State = {"message": "test", "reply": "response"}
        
        assert "message" in test_state
        assert "reply" in test_state
        assert test_state["message"] == "test"
        assert test_state["reply"] == "response"