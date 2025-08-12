import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any

from langchain_core.messages import (
    AIMessage,
    AnyMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

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
    """Deletes an agent and all associated conversations and messages. Returns True if agent was deleted."""
    with get_connection() as conn:
        # Delete associated conversations (which will cascade delete messages)
        conn.execute("DELETE FROM conversations WHERE agent_id = ?", (agent_id,))

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


def create_conversation(agent_id: int, thread_id: str | None = None) -> dict[str, Any]:
    """Creates a new conversation for an agent."""
    if thread_id is None:
        thread_id = str(uuid.uuid4())

    with get_connection() as conn:
        cursor = conn.execute(
            """INSERT INTO conversations (agent_id, thread_id)
               VALUES (?, ?) RETURNING id, agent_id, thread_id, created_at""",
            (agent_id, thread_id),
        )
        return dict(cursor.fetchone())


def get_conversation_by_thread(thread_id: str) -> dict[str, Any] | None:
    """Get conversation by thread_id."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT id, agent_id, thread_id, created_at, updated_at FROM conversations WHERE thread_id = ?",
            (thread_id,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def list_conversations(agent_id: int, limit: int = 100) -> list[dict[str, Any]]:
    """Lists conversations for a specific agent."""
    with get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT id, agent_id, thread_id, created_at, updated_at FROM conversations
            WHERE agent_id = ?
            ORDER BY updated_at DESC, created_at DESC
            LIMIT ?
            """,
            (agent_id, limit),
        )
        return [dict(row) for row in cursor.fetchall()]


def save_message(
    conversation_id: int, message: AnyMessage, sequence_number: int
) -> dict[str, Any]:
    """Save a LangChain message to the database."""
    # Determine message type
    if isinstance(message, HumanMessage):
        message_type = "human"
    elif isinstance(message, AIMessage):
        message_type = "ai"
    elif isinstance(message, SystemMessage):
        message_type = "system"
    elif isinstance(message, ToolMessage):
        message_type = "tool"
    else:
        raise ValueError(f"Unsupported message type: {type(message)}")

    # Extract tool-related data
    tool_calls = None
    tool_call_id = None

    if (
        isinstance(message, AIMessage)
        and hasattr(message, "tool_calls")
        and message.tool_calls
    ):
        tool_calls = json.dumps(message.tool_calls)
    elif isinstance(message, ToolMessage) and hasattr(message, "tool_call_id"):
        tool_call_id = message.tool_call_id

    # Generate message_id if not present
    message_id = getattr(message, "id", None) or str(uuid.uuid4())

    # Extract additional kwargs
    additional_kwargs = json.dumps(getattr(message, "additional_kwargs", {}))

    with get_connection() as conn:
        cursor = conn.execute(
            """INSERT INTO messages
               (conversation_id, message_id, message_type, content, tool_calls, tool_call_id,
                additional_kwargs, sequence_number)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               RETURNING id, message_id, message_type, content, created_at""",
            (
                conversation_id,
                message_id,
                message_type,
                message.content,
                tool_calls,
                tool_call_id,
                additional_kwargs,
                sequence_number,
            ),
        )
        return dict(cursor.fetchone())


def get_conversation_messages(
    conversation_id: int, limit: int = 1000
) -> list[AnyMessage]:
    """Get all messages for a conversation as LangChain message objects."""
    with get_connection() as conn:
        cursor = conn.execute(
            """SELECT message_id, message_type, content, tool_calls, tool_call_id,
                      additional_kwargs, sequence_number
               FROM messages
               WHERE conversation_id = ?
               ORDER BY sequence_number ASC, created_at ASC
               LIMIT ?""",
            (conversation_id, limit),
        )

        messages = []
        for row in cursor.fetchall():
            row_dict = dict(row)
            message = _db_row_to_langchain_message(row_dict)
            messages.append(message)

        return messages


def get_messages_by_thread(thread_id: str, limit: int = 1000) -> list[AnyMessage]:
    """Get all messages for a thread as LangChain message objects."""
    conversation = get_conversation_by_thread(thread_id)
    if not conversation:
        return []

    return get_conversation_messages(conversation["id"], limit)


def save_conversation_messages(
    conversation_id: int, messages: list[AnyMessage], start_sequence: int = 0
):
    """Save multiple LangChain messages to a conversation."""
    for i, message in enumerate(messages):
        save_message(conversation_id, message, start_sequence + i)


def get_or_create_conversation(
    agent_id: int, thread_id: str | None = None
) -> dict[str, Any]:
    """Get existing conversation or create new one."""
    if thread_id:
        conversation = get_conversation_by_thread(thread_id)
        if conversation:
            return conversation

    return create_conversation(agent_id, thread_id)


def get_next_sequence_number(conversation_id: int) -> int:
    """Get the next sequence number for a conversation."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT COALESCE(MAX(sequence_number), 0) + 1 FROM messages WHERE conversation_id = ?",
            (conversation_id,),
        )
        return cursor.fetchone()[0]


def delete_conversation(conversation_id: int) -> bool:
    """Deletes a conversation and all associated messages. Returns True if conversation was deleted."""
    with get_connection() as conn:
        # Messages will be deleted automatically via CASCADE
        cursor = conn.execute(
            "DELETE FROM conversations WHERE id = ?", (conversation_id,)
        )
        return cursor.rowcount > 0


def _db_row_to_langchain_message(row: dict) -> AnyMessage:
    """Convert database row to LangChain message object."""
    message_type = row["message_type"]
    content = row["content"]
    message_id = row["message_id"]

    # Parse additional kwargs
    additional_kwargs = (
        json.loads(row["additional_kwargs"]) if row["additional_kwargs"] else {}
    )

    if message_type == "human":
        return HumanMessage(content=content, id=message_id, **additional_kwargs)

    elif message_type == "ai":
        # Handle tool calls for AIMessage
        tool_calls = json.loads(row["tool_calls"]) if row["tool_calls"] else []
        kwargs = {"content": content, "id": message_id, **additional_kwargs}
        if tool_calls:
            kwargs["tool_calls"] = tool_calls
        return AIMessage(**kwargs)

    elif message_type == "system":
        return SystemMessage(content=content, id=message_id, **additional_kwargs)

    elif message_type == "tool":
        tool_call_id = row["tool_call_id"]
        return ToolMessage(
            content=content,
            id=message_id,
            tool_call_id=tool_call_id,
            **additional_kwargs,
        )

    else:
        raise ValueError(f"Unknown message type: {message_type}")


# Legacy functions for backward compatibility (deprecated)
def list_messages(agent_id: int, limit: int = 1000) -> list[dict[str, Any]]:
    """DEPRECATED: Lists messages for a specific agent in old format."""
    conversations = list_conversations(agent_id, limit)
    all_messages = []

    for conv in conversations:
        messages = get_conversation_messages(conv["id"], limit)
        for msg in messages:
            all_messages.append(
                {
                    "id": getattr(msg, "id", ""),
                    "agent_id": agent_id,
                    "role": msg.__class__.__name__.replace("Message", "").lower(),
                    "content": msg.content,
                    "created_at": "",  # Would need to be fetched separately
                }
            )

    return all_messages


def insert_message(agent_id: int, role: str, content: str):
    """DEPRECATED: Inserts a new message for an agent in legacy format."""
    # Create a conversation if none exists
    conversations = list_conversations(agent_id, 1)
    if conversations:
        conversation_id = conversations[0]["id"]
    else:
        conversation = create_conversation(agent_id)
        conversation_id = conversation["id"]

    # Convert role to message type and create appropriate message
    if role == "user":
        message = HumanMessage(content=content)
    elif role == "assistant":
        message = AIMessage(content=content)
    elif role == "system":
        message = SystemMessage(content=content)
    elif role == "tool":
        message = ToolMessage(content=content, tool_call_id="")
    else:
        raise ValueError(f"Unknown role: {role}")

    next_seq = get_next_sequence_number(conversation_id)
    save_message(conversation_id, message, next_seq)
