import json
import uuid
from datetime import datetime

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
    Execute a web scraping job using the unified research service.
    This function is designed to be called by FastAPI BackgroundTasks.
    """
    try:
        # Update job status to running
        update_job_status(job_id, "running")

        # Import here to avoid circular import
        from agents.research_service import BackgroundJobFormatter, ResearchService

        # Use unified research service
        result = await ResearchService.research_url(agent_id, url)

        if result["success"]:
            # Update job status to success
            formatted_result = BackgroundJobFormatter.format_research_result(result)
            update_job_status(job_id, "success", formatted_result)
        else:
            # Research failed
            formatted_result = BackgroundJobFormatter.format_research_result(result)
            update_job_status(job_id, "failure", formatted_result)

    except Exception as e:
        # Unexpected error
        update_job_status(
            job_id,
            "failure",
            {"error": f"Unexpected error: {e!s}", "scrape_success": False},
        )
