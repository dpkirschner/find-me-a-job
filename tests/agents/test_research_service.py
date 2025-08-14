"""
Tests for the unified research service.
"""

from unittest.mock import MagicMock, patch

import pytest

from agents.research_service import (
    AgentToolFormatter,
    BackgroundJobFormatter,
    ResearchService,
)


class TestResearchService:
    """Test the core ResearchService functionality."""

    @pytest.mark.asyncio
    async def test_research_url_success(self):
        """Test successful URL research."""
        agent_id = 1
        url = "https://example.com"
        mock_content = "This is test content for the research service."
        mock_title = "Test Page"

        # Mock the crawl4ai_scrape function
        with (
            patch("agents.research_service.crawl4ai_scrape") as mock_scrape,
            patch(
                "agents.research_service.get_agent_collection"
            ) as mock_get_collection,
            patch("backend.db.get_connection") as mock_get_connection,
        ):
            # Set up mock scrape result
            mock_scrape.return_value = {
                "success": True,
                "text": mock_content,
                "title": mock_title,
                "word_count": len(mock_content.split()),
            }

            # Set up mock collection
            mock_collection = MagicMock()
            mock_get_collection.return_value = mock_collection

            # Set up mock database connection
            mock_conn = MagicMock()
            mock_get_connection.return_value.__enter__.return_value = mock_conn

            # Execute the research
            result = await ResearchService.research_url(agent_id, url)

            # Verify result structure
            assert result["success"] is True
            assert result["url"] == url
            assert result["title"] == mock_title
            assert result["content"] == mock_content
            assert "word_count" in result
            assert "vector_id" in result
            assert "preview" in result

            # Verify ChromaDB interaction
            mock_get_collection.assert_called_once_with(agent_id)
            mock_collection.add.assert_called_once()

            # Verify database interaction
            mock_get_connection.assert_called_once()
            mock_conn.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_research_url_scrape_failure(self):
        """Test handling of scrape failures."""
        agent_id = 1
        url = "https://invalid-url.com"
        error_message = "Failed to scrape URL"

        with patch("agents.research_service.crawl4ai_scrape") as mock_scrape:
            mock_scrape.return_value = {"success": False, "error": error_message}

            result = await ResearchService.research_url(agent_id, url)

            assert result["success"] is False
            assert result["url"] == url
            assert result["error"] == error_message

    @pytest.mark.asyncio
    async def test_research_url_exception_handling(self):
        """Test exception handling in research_url."""
        agent_id = 1
        url = "https://example.com"

        with patch("agents.research_service.crawl4ai_scrape") as mock_scrape:
            mock_scrape.side_effect = Exception("Network error")

            result = await ResearchService.research_url(agent_id, url)

            assert result["success"] is False
            assert result["url"] == url
            assert "Research error" in result["error"]

    def test_search_research_success(self):
        """Test successful research search."""
        agent_id = 1
        query = "test query"

        # Mock search results
        mock_documents = [["Document 1 content", "Document 2 content"]]
        mock_metadatas = [
            [
                {"title": "Title 1", "url": "https://url1.com", "word_count": 10},
                {"title": "Title 2", "url": "https://url2.com", "word_count": 15},
            ]
        ]

        with patch(
            "agents.research_service.get_agent_collection"
        ) as mock_get_collection:
            mock_collection = MagicMock()
            mock_collection.query.return_value = {
                "documents": mock_documents,
                "metadatas": mock_metadatas,
            }
            mock_get_collection.return_value = mock_collection

            result = ResearchService.search_research(agent_id, query, limit=2)

            assert result["success"] is True
            assert result["query"] == query
            assert result["count"] == 2
            assert len(result["results"]) == 2

            # Check first result structure
            first_result = result["results"][0]
            assert first_result["title"] == "Title 1"
            assert first_result["url"] == "https://url1.com"
            assert "preview" in first_result
            assert first_result["word_count"] == 10

    def test_search_research_no_results(self):
        """Test search when no results are found."""
        agent_id = 1
        query = "nonexistent query"

        with patch(
            "agents.research_service.get_agent_collection"
        ) as mock_get_collection:
            mock_collection = MagicMock()
            mock_collection.query.return_value = {"documents": [[]], "metadatas": [[]]}
            mock_get_collection.return_value = mock_collection

            result = ResearchService.search_research(agent_id, query)

            assert result["success"] is True
            assert result["query"] == query
            assert result["count"] == 0
            assert result["results"] == []

    def test_search_research_exception(self):
        """Test exception handling in search_research."""
        agent_id = 1
        query = "test query"

        with patch(
            "agents.research_service.get_agent_collection"
        ) as mock_get_collection:
            mock_get_collection.side_effect = Exception("Database error")

            result = ResearchService.search_research(agent_id, query)

            assert result["success"] is False
            assert result["query"] == query
            assert "Search error" in result["error"]


class TestAgentToolFormatter:
    """Test the agent tool response formatter."""

    def test_format_research_result_success(self):
        """Test formatting successful research results for agents."""
        result = {
            "success": True,
            "title": "Test Article",
            "preview": "This is a preview of the article content...",
        }

        formatted = AgentToolFormatter.format_research_result(result)

        assert "✓ Researched: Test Article" in formatted
        assert "Content preview:" in formatted
        assert result["preview"] in formatted

    def test_format_research_result_failure(self):
        """Test formatting failed research results for agents."""
        result = {
            "success": False,
            "url": "https://invalid.com",
            "error": "Failed to connect",
        }

        formatted = AgentToolFormatter.format_research_result(result)

        assert "✗ Research failed for https://invalid.com" in formatted
        assert "Failed to connect" in formatted

    def test_format_search_result_with_results(self):
        """Test formatting search results with findings."""
        result = {
            "success": True,
            "query": "test search",
            "count": 2,
            "results": [
                {
                    "title": "Result 1",
                    "url": "https://result1.com",
                    "preview": "Preview 1",
                },
                {
                    "title": "Result 2",
                    "url": "https://result2.com",
                    "preview": "Preview 2",
                },
            ],
        }

        formatted = AgentToolFormatter.format_search_result(result)

        assert "Found 2 relevant research notes:" in formatted
        assert "1. Result 1 (https://result1.com)" in formatted
        assert "2. Result 2 (https://result2.com)" in formatted
        assert "Preview 1" in formatted
        assert "Preview 2" in formatted

    def test_format_search_result_no_results(self):
        """Test formatting search results with no findings."""
        result = {"success": True, "query": "empty search", "count": 0, "results": []}

        formatted = AgentToolFormatter.format_search_result(result)

        assert "No existing research found for query: empty search" in formatted

    def test_format_search_result_error(self):
        """Test formatting search results with error."""
        result = {
            "success": False,
            "query": "error search",
            "error": "Database connection failed",
        }

        formatted = AgentToolFormatter.format_search_result(result)

        assert "Search error: Database connection failed" in formatted


class TestBackgroundJobFormatter:
    """Test the background job response formatter."""

    def test_format_research_result_success(self):
        """Test formatting successful research results for background jobs."""
        result = {
            "success": True,
            "title": "Test Article",
            "word_count": 500,
            "vector_id": "test-vector-id",
            "preview": "This is a preview...",
        }

        formatted = BackgroundJobFormatter.format_research_result(result)

        assert formatted["title"] == "Test Article"
        assert formatted["word_count"] == 500
        assert formatted["vector_id"] == "test-vector-id"
        assert formatted["content_preview"] == "This is a preview..."

    def test_format_research_result_failure(self):
        """Test formatting failed research results for background jobs."""
        result = {"success": False, "error": "Failed to scrape"}

        formatted = BackgroundJobFormatter.format_research_result(result)

        assert formatted["error"] == "Failed to scrape"
        assert formatted["scrape_success"] is False
