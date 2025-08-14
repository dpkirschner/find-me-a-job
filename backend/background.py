import json
import uuid
from datetime import datetime

from agents.tools import crawl4ai_scrape
from backend.chroma_client import get_agent_collection
from backend.db import get_connection


def create_background_job(agent_id: int, task_name: str, payload: dict) -> str:
    """Create a new background job and return the job ID."""
    job_id = str(uuid.uuid4())

    with get_connection() as conn:
        conn.execute(
            """INSERT INTO background_jobs (id, agent_id, task_name, status, payload)
               VALUES (?, ?, ?, 'pending', ?)""",
            (job_id, agent_id, task_name, json.dumps(payload)),
        )

    return job_id


def update_job_status(job_id: str, status: str, result: dict | None = None):
    """Update job status and optionally store result."""
    completed_at = (
        datetime.now().isoformat() if status in ["success", "failure"] else None
    )
    result_json = json.dumps(result) if result else None

    with get_connection() as conn:
        conn.execute(
            """UPDATE background_jobs
               SET status = ?, result = ?, completed_at = ?
               WHERE id = ?""",
            (status, result_json, completed_at, job_id),
        )


def get_job_status(job_id: str) -> dict | None:
    """Get job status and result."""
    with get_connection() as conn:
        cursor = conn.execute(
            """SELECT id, agent_id, task_name, status, payload, result, created_at, completed_at
               FROM background_jobs WHERE id = ?""",
            (job_id,),
        )
        row = cursor.fetchone()

        if row:
            return {
                "job_id": row["id"],
                "agent_id": row["agent_id"],
                "task_name": row["task_name"],
                "status": row["status"],
                "payload": json.loads(row["payload"]) if row["payload"] else {},
                "result": json.loads(row["result"]) if row["result"] else {},
                "created_at": row["created_at"],
                "completed_at": row["completed_at"],
            }
        return None


def store_research_note(agent_id: int, vector_id: str, source_url: str, content: str):
    """Store a research note in the database."""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO research_notes (agent_id, vector_id, source_url, content)
               VALUES (?, ?, ?, ?)""",
            (agent_id, vector_id, source_url, content),
        )


def get_agent_research_notes(agent_id: int, limit: int = 20) -> list[dict]:
    """Get research notes for an agent (latest first)."""
    with get_connection() as conn:
        cursor = conn.execute(
            """SELECT id, vector_id, source_url, content, created_at
               FROM research_notes
               WHERE agent_id = ?
               ORDER BY created_at DESC
               LIMIT ?""",
            (agent_id, limit),
        )

        return [
            {
                "id": row["id"],
                "vector_id": row["vector_id"],
                "source_url": row["source_url"],
                "content": row["content"],
                "created_at": row["created_at"],
            }
            for row in cursor.fetchall()
        ]


async def run_scrape_job(job_id: str, agent_id: int, url: str):
    """
    Execute a web scraping job using Crawl4AI.
    This function is designed to be called by FastAPI BackgroundTasks.
    """
    try:
        # Update job status to running
        update_job_status(job_id, "running")

        # Use Crawl4AI to scrape the URL
        scrape_result = await crawl4ai_scrape(url)

        if scrape_result["success"]:
            # Store content in ChromaDB
            collection = get_agent_collection(agent_id)
            vector_id = str(uuid.uuid4())

            try:
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
                store_research_note(
                    agent_id=agent_id,
                    vector_id=vector_id,
                    source_url=url,
                    content=scrape_result["text"],
                )

                # Update job status to success
                update_job_status(
                    job_id,
                    "success",
                    {
                        "title": scrape_result["title"],
                        "word_count": scrape_result["word_count"],
                        "vector_id": vector_id,
                        "content_preview": scrape_result["text"][:200] + "..."
                        if len(scrape_result["text"]) > 200
                        else scrape_result["text"],
                    },
                )

            except Exception as e:
                # ChromaDB or database error
                update_job_status(
                    job_id,
                    "failure",
                    {
                        "error": f"Storage error: {e!s}",
                        "scrape_success": True,
                        "title": scrape_result.get("title", "Unknown"),
                    },
                )
        else:
            # Scraping failed
            update_job_status(
                job_id,
                "failure",
                {"error": scrape_result["error"], "scrape_success": False},
            )

    except Exception as e:
        # Unexpected error
        update_job_status(
            job_id,
            "failure",
            {"error": f"Unexpected error: {e!s}", "scrape_success": False},
        )
