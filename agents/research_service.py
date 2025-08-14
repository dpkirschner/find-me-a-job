"""
Unified research service that supports both synchronous agent tool calls
and asynchronous background job workflows.
"""

import uuid

from agents.tools import crawl4ai_scrape
from backend.chroma_client import get_agent_collection


class ResearchService:
    """Unified research service for both agent tools and background jobs."""

    @staticmethod
    async def research_url(agent_id: int, url: str) -> dict:
        """
        Research a URL and store the results.
        Returns standardized response format for both agent tools and background jobs.
        """
        try:
            # Use existing crawl4ai scraping function
            scrape_result = await crawl4ai_scrape(url)

            if scrape_result["success"]:
                # Store in ChromaDB and database
                vector_id = str(uuid.uuid4())
                collection = get_agent_collection(agent_id)

                collection.add(
                    ids=[vector_id],
                    documents=[scrape_result["text"]],
                    metadatas=[
                        {
                            "agent_id": agent_id,
                            "url": url,
                            "title": scrape_result["title"],
                            "word_count": scrape_result["word_count"],
                        }
                    ],
                )

                # Store in database
                from backend.db import get_connection

                with get_connection() as conn:
                    conn.execute(
                        """INSERT INTO research_notes (agent_id, vector_id, source_url, content)
                           VALUES (?, ?, ?, ?)""",
                        (agent_id, vector_id, url, scrape_result["text"]),
                    )

                return {
                    "success": True,
                    "url": url,
                    "title": scrape_result["title"],
                    "content": scrape_result["text"],
                    "word_count": scrape_result["word_count"],
                    "vector_id": vector_id,
                    "preview": scrape_result["text"][:500] + "..."
                    if len(scrape_result["text"]) > 500
                    else scrape_result["text"],
                }
            else:
                return {"success": False, "url": url, "error": scrape_result["error"]}

        except Exception as e:
            return {"success": False, "url": url, "error": f"Research error: {e!s}"}

    @staticmethod
    def search_research(agent_id: int, query: str, limit: int = 3) -> dict:
        """
        Search existing research notes for relevant content.
        Returns standardized response format.
        """
        try:
            collection = get_agent_collection(agent_id)
            results = collection.query(query_texts=[query], n_results=limit)

            if results["documents"] and results["documents"][0]:
                found_results = []
                for doc, metadata in zip(
                    results["documents"][0], results["metadatas"][0]
                ):
                    preview = doc[:300] + "..." if len(doc) > 300 else doc
                    found_results.append(
                        {
                            "title": metadata["title"],
                            "url": metadata["url"],
                            "preview": preview,
                            "word_count": metadata.get("word_count", 0),
                        }
                    )

                return {
                    "success": True,
                    "query": query,
                    "results": found_results,
                    "count": len(found_results),
                }
            else:
                return {"success": True, "query": query, "results": [], "count": 0}

        except Exception as e:
            return {
                "success": False,
                "query": query,
                "error": f"Search error: {e!s}",
            }


class AgentToolFormatter:
    """Formats research service results for agent tool consumption."""

    @staticmethod
    def format_research_result(result: dict) -> str:
        """Format research result for agent tool response."""
        if result["success"]:
            return f"✓ Researched: {result['title']}\n\nContent preview:\n{result['preview']}"
        else:
            return f"✗ Research failed for {result['url']}: {result['error']}"

    @staticmethod
    def format_search_result(result: dict) -> str:
        """Format search result for agent tool response."""
        if result["success"]:
            if result["count"] > 0:
                summaries = []
                for i, res in enumerate(result["results"], 1):
                    summaries.append(
                        f"{i}. {res['title']} ({res['url']})\n{res['preview']}"
                    )
                return (
                    f"Found {result['count']} relevant research notes:\n\n"
                    + "\n\n".join(summaries)
                )
            else:
                return f"No existing research found for query: {result['query']}"
        else:
            return f"Search error: {result['error']}"


class BackgroundJobFormatter:
    """Formats research service results for background job consumption."""

    @staticmethod
    def format_research_result(result: dict) -> dict:
        """Format research result for background job response."""
        if result["success"]:
            return {
                "title": result["title"],
                "word_count": result["word_count"],
                "vector_id": result["vector_id"],
                "content_preview": result["preview"],
            }
        else:
            return {"error": result["error"], "scrape_success": False}
