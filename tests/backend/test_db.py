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

    def test_create_agent(self, db_connection: sqlite3.Connection):
        agent_data = db.create_agent("test_agent")
        assert agent_data["name"] == "test_agent"
        assert "id" in agent_data
        assert agent_data["id"] is not None

    def test_agent_exists(self, db_connection: sqlite3.Connection):
        # Test non-existent agent
        assert db.agent_exists(999) is False

        # Create and test existing agent
        agent_data = db.create_agent("test_agent")
        assert db.agent_exists(agent_data["id"]) is True

    def test_delete_agent_success(self, db_connection: sqlite3.Connection):
        # Create an agent
        agent_data = db.create_agent("agent_to_delete")
        agent_id = agent_data["id"]

        # Verify agent exists
        assert db.agent_exists(agent_id) is True
        assert len(db.list_agents()) == 1

        # Delete agent
        result = db.delete_agent(agent_id)

        # Verify deletion was successful
        assert result is True
        assert db.agent_exists(agent_id) is False
        assert len(db.list_agents()) == 0

    def test_delete_agent_nonexistent(self, db_connection: sqlite3.Connection):
        # Try to delete non-existent agent
        result = db.delete_agent(999)

        # Should return False for non-existent agent
        assert result is False

    def test_delete_agent_with_messages(self, db_connection: sqlite3.Connection):
        # Create an agent
        agent_data = db.create_agent("agent_with_messages")
        agent_id = agent_data["id"]

        # Add messages to the agent
        db.insert_message(agent_id, "user", "Hello")
        db.insert_message(agent_id, "assistant", "Hi there")

        # Verify messages exist
        messages = db.list_messages(agent_id)
        assert len(messages) == 2

        # Delete agent (should cascade delete messages)
        result = db.delete_agent(agent_id)

        # Verify agent and messages are deleted
        assert result is True
        assert db.agent_exists(agent_id) is False
        assert len(db.list_messages(agent_id)) == 0
        assert len(db.list_agents()) == 0

    def test_delete_agent_cascade_only_affects_target(
        self, db_connection: sqlite3.Connection
    ):
        # Create two agents
        agent1_data = db.create_agent("agent1")
        agent2_data = db.create_agent("agent2")
        agent1_id = agent1_data["id"]
        agent2_id = agent2_data["id"]

        # Add messages to both agents
        db.insert_message(agent1_id, "user", "Message from agent1")
        db.insert_message(agent2_id, "user", "Message from agent2")

        # Verify both agents have messages
        assert len(db.list_messages(agent1_id)) == 1
        assert len(db.list_messages(agent2_id)) == 1
        assert len(db.list_agents()) == 2

        # Delete only agent1
        result = db.delete_agent(agent1_id)

        # Verify only agent1 and its messages are deleted
        assert result is True
        assert db.agent_exists(agent1_id) is False
        assert db.agent_exists(agent2_id) is True
        assert len(db.list_messages(agent1_id)) == 0
        assert len(db.list_messages(agent2_id)) == 1
        assert len(db.list_agents()) == 1


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
