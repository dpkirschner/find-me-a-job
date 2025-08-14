"""
Tests for LangChain agent tools.
"""

from unittest.mock import patch

import pytest

from agents.agent_tools import AGENT_TOOLS, research_url, search_research


class TestAgentToolsDefinition:
    """Test the tool definitions and exports."""

    def test_agent_tools_list(self):
        """Test that AGENT_TOOLS contains the expected tools."""
        assert len(AGENT_TOOLS) == 2

        tool_names = [tool.name for tool in AGENT_TOOLS]
        assert "research_url" in tool_names
        assert "search_research" in tool_names

    def test_research_url_tool_properties(self):
        """Test research_url tool properties."""
        tool = None
        for t in AGENT_TOOLS:
            if t.name == "research_url":
                tool = t
                break

        assert tool is not None
        assert tool.name == "research_url"
        assert "Research URL and return content" in tool.description
        assert tool.args_schema is not None

        # Check that the tool has the expected parameters
        schema_properties = tool.args_schema.model_json_schema()["properties"]
        assert "url" in schema_properties
        assert "agent_id" in schema_properties

    def test_search_research_tool_properties(self):
        """Test search_research tool properties."""
        tool = None
        for t in AGENT_TOOLS:
            if t.name == "search_research":
                tool = t
                break

        assert tool is not None
        assert tool.name == "search_research"
        assert "Search existing research notes" in tool.description
        assert tool.args_schema is not None

        # Check that the tool has the expected parameters
        schema_properties = tool.args_schema.model_json_schema()["properties"]
        assert "query" in schema_properties
        assert "agent_id" in schema_properties
        assert "limit" in schema_properties


class TestResearchUrlTool:
    """Test the research_url tool functionality."""

    @pytest.mark.asyncio
    async def test_research_url_success(self):
        """Test successful URL research through the tool."""
        url = "https://example.com"
        agent_id = 1

        mock_result = {
            "success": True,
            "title": "Example Page",
            "preview": "This is example content...",
        }

        with (
            patch("agents.agent_tools.ResearchService.research_url") as mock_research,
            patch(
                "agents.agent_tools.AgentToolFormatter.format_research_result"
            ) as mock_format,
        ):
            mock_research.return_value = mock_result
            mock_format.return_value = "✓ Researched: Example Page\n\nContent preview:\nThis is example content..."

            result = await research_url.ainvoke({"url": url, "agent_id": agent_id})

            mock_research.assert_called_once_with(agent_id, url)
            mock_format.assert_called_once_with(mock_result)
            assert "✓ Researched: Example Page" in result

    @pytest.mark.asyncio
    async def test_research_url_failure(self):
        """Test failed URL research through the tool."""
        url = "https://invalid.com"
        agent_id = 1

        mock_result = {"success": False, "url": url, "error": "Connection failed"}

        with (
            patch("agents.agent_tools.ResearchService.research_url") as mock_research,
            patch(
                "agents.agent_tools.AgentToolFormatter.format_research_result"
            ) as mock_format,
        ):
            mock_research.return_value = mock_result
            mock_format.return_value = (
                "✗ Research failed for https://invalid.com: Connection failed"
            )

            result = await research_url.ainvoke({"url": url, "agent_id": agent_id})

            mock_research.assert_called_once_with(agent_id, url)
            mock_format.assert_called_once_with(mock_result)
            assert "✗ Research failed" in result

    @pytest.mark.asyncio
    async def test_research_url_tool_call_format(self):
        """Test that the tool can be called in LangChain tool call format."""
        # This simulates how LangChain would call the tool
        tool_call_args = {"url": "https://test.com", "agent_id": 42}

        mock_result = {"success": True, "title": "Test Page", "preview": "Test content"}

        with (
            patch("agents.agent_tools.ResearchService.research_url") as mock_research,
            patch(
                "agents.agent_tools.AgentToolFormatter.format_research_result"
            ) as mock_format,
        ):
            mock_research.return_value = mock_result
            mock_format.return_value = "Formatted result"

            # Test direct tool invocation
            result = await research_url.ainvoke(tool_call_args)

            assert isinstance(result, str)
            mock_research.assert_called_once_with(42, "https://test.com")


class TestSearchResearchTool:
    """Test the search_research tool functionality."""

    def test_search_research_success(self):
        """Test successful research search through the tool."""
        query = "test query"
        agent_id = 1
        limit = 3

        mock_result = {
            "success": True,
            "query": query,
            "count": 2,
            "results": [
                {"title": "Result 1", "url": "https://r1.com", "preview": "Preview 1"},
                {"title": "Result 2", "url": "https://r2.com", "preview": "Preview 2"},
            ],
        }

        with (
            patch("agents.agent_tools.ResearchService.search_research") as mock_search,
            patch(
                "agents.agent_tools.AgentToolFormatter.format_search_result"
            ) as mock_format,
        ):
            mock_search.return_value = mock_result
            mock_format.return_value = (
                "Found 2 relevant research notes:\n\n1. Result 1..."
            )

            result = search_research.invoke(
                {"query": query, "agent_id": agent_id, "limit": limit}
            )

            mock_search.assert_called_once_with(agent_id, query, limit)
            mock_format.assert_called_once_with(mock_result)
            assert "Found 2 relevant research notes" in result

    def test_search_research_default_limit(self):
        """Test search_research with default limit parameter."""
        query = "test query"
        agent_id = 1

        mock_result = {"success": True, "query": query, "count": 0, "results": []}

        with (
            patch("agents.agent_tools.ResearchService.search_research") as mock_search,
            patch(
                "agents.agent_tools.AgentToolFormatter.format_search_result"
            ) as mock_format,
        ):
            mock_search.return_value = mock_result
            mock_format.return_value = "No existing research found"

            # Call without limit parameter to test default
            search_research.invoke({"query": query, "agent_id": agent_id})

            # Should use default limit of 3
            mock_search.assert_called_once_with(agent_id, query, 3)
            mock_format.assert_called_once_with(mock_result)

    def test_search_research_no_results(self):
        """Test search_research when no results are found."""
        query = "nonexistent query"
        agent_id = 1

        mock_result = {"success": True, "query": query, "count": 0, "results": []}

        with (
            patch("agents.agent_tools.ResearchService.search_research") as mock_search,
            patch(
                "agents.agent_tools.AgentToolFormatter.format_search_result"
            ) as mock_format,
        ):
            mock_search.return_value = mock_result
            mock_format.return_value = (
                "No existing research found for query: nonexistent query"
            )

            result = search_research.invoke({"query": query, "agent_id": agent_id})

            mock_search.assert_called_once_with(agent_id, query, 3)
            assert "No existing research found" in result

    def test_search_research_error(self):
        """Test search_research error handling."""
        query = "error query"
        agent_id = 1

        mock_result = {"success": False, "query": query, "error": "Database error"}

        with (
            patch("agents.agent_tools.ResearchService.search_research") as mock_search,
            patch(
                "agents.agent_tools.AgentToolFormatter.format_search_result"
            ) as mock_format,
        ):
            mock_search.return_value = mock_result
            mock_format.return_value = "Search error: Database error"

            result = search_research.invoke({"query": query, "agent_id": agent_id})

            assert "Search error" in result


class TestToolIntegration:
    """Test tools work together and with LangChain properly."""

    def test_tools_are_langchain_compatible(self):
        """Test that all tools are proper LangChain tools."""
        from langchain_core.tools import BaseTool

        for tool in AGENT_TOOLS:
            assert isinstance(tool, BaseTool)
            assert hasattr(tool, "name")
            assert hasattr(tool, "description")
            assert hasattr(tool, "args_schema")

    @pytest.mark.asyncio
    async def test_tool_parameter_validation(self):
        """Test that tools validate their parameters correctly."""
        # Test research_url with missing parameters
        with pytest.raises(Exception):  # Should raise validation error
            await research_url.ainvoke({"url": "https://test.com"})  # Missing agent_id

        # Test search_research with missing parameters
        with pytest.raises(Exception):  # Should raise validation error
            search_research.invoke({"query": "test"})  # Missing agent_id

    def test_tool_schema_generation(self):
        """Test that tools generate proper schemas for LLM consumption."""
        for tool in AGENT_TOOLS:
            schema = tool.args_schema.model_json_schema()

            # All tools should have properties and required fields
            assert "properties" in schema
            assert "required" in schema

            # Agent ID should be required for all tools
            assert "agent_id" in schema["required"]
