import sqlite3

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

# Import the module we are testing
from backend import db


def load_init_sql() -> str:
    """Load the SQL initialization script from file."""
    with open(db.INIT_SQL_PATH) as f:
        return f.read()


@pytest.fixture
def db_connection(monkeypatch: pytest.MonkeyPatch) -> sqlite3.Connection:
    """
    Provides a pristine, in-memory SQLite database for each test,
    ensuring complete isolation.
    """
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    conn.executescript(load_init_sql())

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
        assert messages[0]["role"] == "human"  # Updated for new schema
        assert messages[1]["content"] == "Hi there"

    def test_list_messages_respects_limit(self, agent_id: int):
        db.insert_message(agent_id, "user", "Message 1")
        db.insert_message(agent_id, "user", "Message 2")
        db.insert_message(agent_id, "user", "Message 3")

        messages = db.list_messages(agent_id, limit=2)
        assert len(messages) == 2


class TestConversationFunctions:
    @pytest.fixture
    def agent_id(self, db_connection: sqlite3.Connection) -> int:
        """A fixture that seeds one agent and returns its ID."""
        db.ensure_seed_agents(["test_agent"])
        return db.list_agents()[0]["id"]

    def test_create_conversation(self, agent_id: int):
        conversation = db.create_conversation(agent_id)

        assert "id" in conversation
        assert conversation["agent_id"] == agent_id
        assert "thread_id" in conversation
        assert conversation["thread_id"] is not None
        assert "created_at" in conversation

    def test_create_conversation_with_thread_id(self, agent_id: int):
        thread_id = "test-thread-123"
        conversation = db.create_conversation(agent_id, thread_id)

        assert conversation["agent_id"] == agent_id
        assert conversation["thread_id"] == thread_id

    def test_get_conversation_by_thread(self, agent_id: int):
        # Create conversation
        created_conv = db.create_conversation(agent_id, "test-thread")

        # Retrieve by thread_id
        retrieved_conv = db.get_conversation_by_thread("test-thread")

        assert retrieved_conv is not None
        assert retrieved_conv["id"] == created_conv["id"]
        assert retrieved_conv["thread_id"] == "test-thread"

    def test_get_conversation_by_thread_nonexistent(self, agent_id: int):
        result = db.get_conversation_by_thread("nonexistent-thread")
        assert result is None

    def test_list_conversations(self, agent_id: int):
        # Initially empty
        assert db.list_conversations(agent_id) == []

        # Create conversations
        conv1 = db.create_conversation(agent_id, "thread-1")
        conv2 = db.create_conversation(agent_id, "thread-2")
        assert conv1 is not None
        assert conv2 is not None

        conversations = db.list_conversations(agent_id)
        assert len(conversations) == 2

        # Should be ordered by updated_at DESC
        thread_ids = [conv["thread_id"] for conv in conversations]
        assert "thread-2" in thread_ids
        assert "thread-1" in thread_ids

    def test_get_or_create_conversation_existing(self, agent_id: int):
        # Create conversation
        original = db.create_conversation(agent_id, "existing-thread")

        # Get existing conversation
        retrieved = db.get_or_create_conversation(agent_id, "existing-thread")

        assert retrieved["id"] == original["id"]
        assert retrieved["thread_id"] == "existing-thread"

    def test_get_or_create_conversation_new(self, agent_id: int):
        # Get non-existing conversation (should create new)
        conversation = db.get_or_create_conversation(agent_id, "new-thread")

        assert conversation["agent_id"] == agent_id
        assert conversation["thread_id"] == "new-thread"

    def test_get_or_create_conversation_auto_thread(self, agent_id: int):
        # Create without specifying thread_id
        conversation = db.get_or_create_conversation(agent_id)

        assert conversation["agent_id"] == agent_id
        assert conversation["thread_id"] is not None
        assert len(conversation["thread_id"]) > 0

    def test_delete_conversation(self, agent_id: int):
        # Create conversation
        conversation = db.create_conversation(agent_id, "delete-me")
        conversation_id = conversation["id"]

        # Verify it exists
        assert db.get_conversation_by_thread("delete-me") is not None

        # Delete it
        result = db.delete_conversation(conversation_id)
        assert result is True

        # Verify it's gone
        assert db.get_conversation_by_thread("delete-me") is None

    def test_delete_conversation_nonexistent(self, agent_id: int):
        result = db.delete_conversation(999)
        assert result is False


class TestLangChainMessageFunctions:
    @pytest.fixture
    def conversation_id(self, db_connection: sqlite3.Connection) -> int:
        """Create an agent and conversation for message testing."""
        db.ensure_seed_agents(["test_agent"])
        agent_id = db.list_agents()[0]["id"]
        conversation = db.create_conversation(agent_id, "test-conversation")
        return conversation["id"]

    def test_save_human_message(self, conversation_id: int):
        message = HumanMessage(content="Hello, world!")

        result = db.save_message(conversation_id, message, 1)

        assert "id" in result
        assert result["message_type"] == "human"
        assert result["content"] == "Hello, world!"

    def test_save_ai_message(self, conversation_id: int):
        message = AIMessage(content="Hello there!")

        result = db.save_message(conversation_id, message, 1)

        assert result["message_type"] == "ai"
        assert result["content"] == "Hello there!"

    def test_save_ai_message_with_tool_calls(self, conversation_id: int):
        tool_calls = [
            {"name": "test_tool", "args": {"param": "value"}, "id": "call_123"}
        ]
        message = AIMessage(content="Using tool...", tool_calls=tool_calls)

        db.save_message(conversation_id, message, 1)

        # Retrieve and verify
        messages = db.get_conversation_messages(conversation_id)
        assert len(messages) == 1
        assert len(messages[0].tool_calls) == 1
        assert messages[0].tool_calls[0]["name"] == "test_tool"
        assert messages[0].tool_calls[0]["args"] == {"param": "value"}
        assert messages[0].tool_calls[0]["id"] == "call_123"

    def test_save_tool_message(self, conversation_id: int):
        message = ToolMessage(content="Tool result", tool_call_id="call_123")

        result = db.save_message(conversation_id, message, 1)

        assert result["message_type"] == "tool"
        assert result["content"] == "Tool result"

    def test_save_system_message(self, conversation_id: int):
        message = SystemMessage(content="System prompt")

        result = db.save_message(conversation_id, message, 1)

        assert result["message_type"] == "system"
        assert result["content"] == "System prompt"

    def test_get_conversation_messages(self, conversation_id: int):
        # Save multiple messages in sequence
        messages_to_save = [
            HumanMessage(content="Hello"),
            AIMessage(content="Hi there!"),
            HumanMessage(content="How are you?"),
            AIMessage(content="I'm doing well!"),
        ]

        for i, msg in enumerate(messages_to_save):
            db.save_message(conversation_id, msg, i + 1)

        # Retrieve messages
        retrieved_messages = db.get_conversation_messages(conversation_id)

        assert len(retrieved_messages) == 4
        assert isinstance(retrieved_messages[0], HumanMessage)
        assert isinstance(retrieved_messages[1], AIMessage)
        assert retrieved_messages[0].content == "Hello"
        assert retrieved_messages[3].content == "I'm doing well!"

    def test_get_messages_by_thread(self, db_connection: sqlite3.Connection):
        # Create agent and conversation
        db.ensure_seed_agents(["test_agent"])
        agent_id = db.list_agents()[0]["id"]
        conversation = db.create_conversation(agent_id, "message-thread")
        conversation_id = conversation["id"]

        # Save messages
        db.save_message(conversation_id, HumanMessage(content="Test message"), 1)
        db.save_message(conversation_id, AIMessage(content="Test response"), 2)

        # Retrieve by thread_id
        messages = db.get_messages_by_thread("message-thread")

        assert len(messages) == 2
        assert messages[0].content == "Test message"
        assert messages[1].content == "Test response"

    def test_get_messages_by_thread_nonexistent(self, conversation_id: int):
        messages = db.get_messages_by_thread("nonexistent-thread")
        assert messages == []

    def test_save_conversation_messages(self, conversation_id: int):
        messages = [
            HumanMessage(content="Message 1"),
            AIMessage(content="Message 2"),
            HumanMessage(content="Message 3"),
        ]

        db.save_conversation_messages(conversation_id, messages, start_sequence=1)

        retrieved = db.get_conversation_messages(conversation_id)
        assert len(retrieved) == 3
        assert retrieved[0].content == "Message 1"
        assert retrieved[1].content == "Message 2"
        assert retrieved[2].content == "Message 3"

    def test_get_next_sequence_number(self, conversation_id: int):
        # Initially should be 1
        assert db.get_next_sequence_number(conversation_id) == 1

        # Add a message
        db.save_message(conversation_id, HumanMessage(content="First"), 1)

        # Should now be 2
        assert db.get_next_sequence_number(conversation_id) == 2

        # Add another message
        db.save_message(conversation_id, AIMessage(content="Second"), 2)

        # Should now be 3
        assert db.get_next_sequence_number(conversation_id) == 3

    def test_message_ordering(self, conversation_id: int):
        # Save messages out of sequence order
        db.save_message(conversation_id, HumanMessage(content="Third"), 3)
        db.save_message(conversation_id, HumanMessage(content="First"), 1)
        db.save_message(conversation_id, HumanMessage(content="Second"), 2)

        # Retrieve should be in sequence order
        messages = db.get_conversation_messages(conversation_id)
        assert len(messages) == 3
        assert messages[0].content == "First"
        assert messages[1].content == "Second"
        assert messages[2].content == "Third"

    def test_message_deduplication(self, conversation_id: int):
        # Create message with specific ID
        message1 = HumanMessage(content="Hello", id="msg_123")
        message2 = HumanMessage(content="Different content", id="msg_123")  # Same ID

        # Save first message
        db.save_message(conversation_id, message1, 1)

        # Attempt to save second message with same ID should fail due to unique constraint
        with pytest.raises(sqlite3.IntegrityError):
            db.save_message(conversation_id, message2, 2)
