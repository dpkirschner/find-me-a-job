-- sql/0001_init.sql (LangGraph optimized)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversations/threads table for LangGraph checkpointing
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  thread_id TEXT UNIQUE NOT NULL, -- LangGraph thread identifier
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Messages table optimized for LangChain message types
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  
  -- LangChain message identification
  message_id TEXT UNIQUE NOT NULL, -- LangChain message.id (for deduplication)
  message_type TEXT NOT NULL CHECK(message_type IN ('human', 'ai', 'system', 'tool')),
  
  -- Core message content
  content TEXT NOT NULL,
  
  -- Tool-related fields for AIMessage and ToolMessage
  tool_calls TEXT, -- JSON array of tool calls for AIMessage
  tool_call_id TEXT, -- For ToolMessage linking to AIMessage tool calls
  
  -- Additional LangChain features
  additional_kwargs TEXT, -- JSON for extra LangChain message properties
  
  -- Ordering and timestamps
  sequence_number INTEGER NOT NULL, -- Message order in conversation
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_thread ON conversations(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(conversation_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type);
CREATE INDEX IF NOT EXISTS idx_messages_tool_call ON messages(tool_call_id);

-- Trigger to update conversation updated_at
CREATE TRIGGER IF NOT EXISTS update_conversation_timestamp 
AFTER INSERT ON messages
BEGIN
  UPDATE conversations 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE id = NEW.conversation_id;
END;