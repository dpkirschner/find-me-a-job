import sqlite3
from pathlib import Path
from typing import Any

# Centralize configuration
DB_PATH = Path("memory/db.sqlite")
INIT_SQL_PATH = Path("sql/0001_init.sql")


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    """Establishes a SQLite connection with sensible defaults."""
    db_path.parent.mkdir(exist_ok=True)

    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row  # Return dict-like rows

    # Enable performance and integrity PRAGMAs
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")

    return conn


def initialize_database():
    """Initializes the database by executing the setup SQL script."""
    if not INIT_SQL_PATH.exists():
        raise FileNotFoundError(f"Initialization SQL not found: {INIT_SQL_PATH}")

    with get_connection() as conn:
        with open(INIT_SQL_PATH) as f:
            conn.executescript(f.read())


def list_agents() -> list[dict[str, Any]]:
    """Lists all agents."""
    with get_connection() as conn:
        cursor = conn.execute("SELECT id, name FROM agents ORDER BY id")
        return [dict(row) for row in cursor.fetchall()]


def agent_exists(agent_id: int) -> bool:
    """Check if an agent exists."""
    with get_connection() as conn:
        cursor = conn.execute("SELECT 1 FROM agents WHERE id = ? LIMIT 1", (agent_id,))
        return cursor.fetchone() is not None


def create_agent(name: str) -> dict[str, Any]:
    """Creates a new agent and returns the created agent data."""
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO agents (name) VALUES (?) RETURNING id, name, created_at",
            (name,),
        )
        row = cursor.fetchone()
        return dict(row)


def delete_agent(agent_id: int) -> bool:
    """Deletes an agent and all associated messages. Returns True if agent was deleted."""
    with get_connection() as conn:
        # First delete associated messages
        conn.execute("DELETE FROM messages WHERE agent_id = ?", (agent_id,))

        # Then delete the agent
        cursor = conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))

        # Return True if a row was actually deleted
        return cursor.rowcount > 0


def ensure_seed_agents(names: list[str]):
    """Inserts a list of agent names if the agents table is empty."""
    with get_connection() as conn:
        if conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0] == 0:
            agents_to_insert = [(name,) for name in names]
            conn.executemany("INSERT INTO agents (name) VALUES (?)", agents_to_insert)
            print(f"Database seeded with {len(names)} agents.")


def list_messages(agent_id: int, limit: int = 1000) -> list[dict[str, Any]]:
    """Lists messages for a specific agent."""
    with get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT id, agent_id, role, content, created_at FROM messages
            WHERE agent_id = ?
            ORDER BY created_at ASC, id ASC
            LIMIT ?
            """,
            (agent_id, limit),
        )
        return [dict(row) for row in cursor.fetchall()]


def insert_message(agent_id: int, role: str, content: str):
    """Inserts a new message for an agent."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO messages (agent_id, role, content) VALUES (?, ?, ?)",
            (agent_id, role, content),
        )
