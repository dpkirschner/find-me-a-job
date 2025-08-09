import sqlite3

import pytest

# Import the module we are testing
from backend import db

# THE FIX: Use the full, correct schema for the tests.
INIT_SQL_CONTENT = """
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
"""


@pytest.fixture
def db_connection(monkeypatch: pytest.MonkeyPatch) -> sqlite3.Connection:
    """
    Provides a pristine, in-memory SQLite database for each test,
    ensuring complete isolation.
    """
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    conn.executescript(INIT_SQL_CONTENT)

    monkeypatch.setattr(db, "get_connection", lambda: conn)

    yield conn

    conn.close()


class TestAgentFunctions:
    def test_list_agents_returns_empty_list(self, db_connection: sqlite3.Connection):
        assert db.list_agents() == []

    def test_ensure_seed_agents(self, db_connection: sqlite3.Connection):
        db.ensure_seed_agents(["orchestrator", "researcher"])
        agents = db.list_agents()
        assert len(agents) == 2
        assert agents[0]["name"] == "orchestrator"

        db.ensure_seed_agents(["writer"])
        assert len(db.list_agents()) == 2


class TestMessageFunctions:
    @pytest.fixture
    def agent_id(self, db_connection: sqlite3.Connection) -> int:
        """A fixture that seeds one agent and returns its ID."""
        db.ensure_seed_agents(["test_agent"])
        return db.list_agents()[0]["id"]

    def test_list_messages_empty(self, agent_id: int):
        assert db.list_messages(agent_id) == []

    def test_insert_and_list_messages(self, agent_id: int):
        db.insert_message(agent_id, "user", "Hello")
        db.insert_message(agent_id, "assistant", "Hi there")

        messages = db.list_messages(agent_id)

        assert len(messages) == 2
        assert messages[0]["role"] == "user"
        assert messages[1]["content"] == "Hi there"

    def test_list_messages_respects_limit(self, agent_id: int):
        db.insert_message(agent_id, "user", "Message 1")
        db.insert_message(agent_id, "user", "Message 2")
        db.insert_message(agent_id, "user", "Message 3")

        messages = db.list_messages(agent_id, limit=2)
        assert len(messages) == 2
