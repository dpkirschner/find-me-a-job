Frontend Integration Guide: Agent → Conversation Model

  Key Changes Overview

  The frontend should migrate from agent-centric to conversation-centric workflows:

  - Old: Agent → Messages
  + New: Agent → Conversations → Messages

  API Migration

  Chat Endpoint (Enhanced)

  // OLD: Basic chat
  POST /chat
  {
    "message": "Hello",
    "agent_id": 1
  }

  // NEW: Conversation-aware chat
  POST /chat
  {
    "message": "Hello",
    "agent_id": 1,
    "thread_id": "uuid-string"  // Optional - auto-generated if omitted
  }

  // Response includes thread_id in header
  Response Headers:
  X-Thread-ID: "550e8400-e29b-41d4-a716-446655440000"

  New Conversation Endpoints

  // List agent's conversations
  GET /agents/{agent_id}/conversations
  → { conversations: [{ id, agent_id, thread_id, created_at, updated_at }] }

  // Create new conversation
  POST /conversations
  { "agent_id": 1, "thread_id": "optional-uuid" }
  → { conversation: { id, agent_id, thread_id, created_at, updated_at } }

  // Get conversation messages
  GET /conversations/{thread_id}/messages
  → { messages: [{ id, role, content, created_at }] }

  // Delete conversation
  DELETE /conversations/{thread_id}
  → 204 No Content

  Frontend State Management

  Before (Agent-focused)

  interface AppState {
    selectedAgent: Agent | null;
    messages: Message[];
  }

  After (Conversation-focused)

  interface AppState {
    selectedAgent: Agent | null;
    conversations: Conversation[];
    activeThreadId: string | null;
    messages: Message[];
  }

  interface Conversation {
    id: number;
    agent_id: number;
    thread_id: string;
    created_at: string;
    updated_at: string;
  }

  Recommended UI Flow

  1. Agent Selection

  // Load agent's conversations
  const conversations = await fetch(`/agents/${agentId}/conversations`);
  setConversations(conversations);
  setActiveThreadId(conversations[0]?.thread_id || null);

  2. Conversation Management

  // Start new conversation
  const newConv = await fetch('/conversations', {
    method: 'POST',
    body: JSON.stringify({ agent_id: selectedAgent.id })
  });
  setActiveThreadId(newConv.conversation.thread_id);

  // Switch conversation
  const messages = await fetch(`/conversations/${threadId}/messages`);
  setMessages(messages);
  setActiveThreadId(threadId);

  3. Sending Messages

  // Include thread_id in chat requests
  const response = await fetch('/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: userInput,
      agent_id: selectedAgent.id,
      thread_id: activeThreadId  // Maintains conversation context
    })
  });

  // Extract thread_id from response header
  const threadId = response.headers.get('X-Thread-ID');
  if (!activeThreadId) setActiveThreadId(threadId);

  Migration Benefits

  1. Conversation History - Users can maintain multiple concurrent conversations per agent
  2. Context Preservation - Full message history automatically included in LLM requests
  3. Better UX - Conversation threads like modern chat apps
  4. LangGraph Compatibility - Native support for LangGraph's conversation model

  Backward Compatibility

  - Legacy endpoints preserved - /agents/{id}/messages still works but marked deprecated
  - Automatic thread creation - If no thread_id provided, one is auto-generated
  - Gradual migration - Frontend can adopt conversation features incrementally

## Implementation Plan

### Phase 1: Core Infrastructure
1. **Update types** (`frontend/features/chat/types.ts`)
   - Add `Conversation` interface with id, agent_id, thread_id, created_at, updated_at
   - Add `thread_id?: string` to ChatRequest interface
   - Update state interfaces for conversation management

2. **Create conversation service** (`frontend/features/chat/services/conversationService.ts`)
   - `getConversations(agentId: number)` - GET /agents/{agent_id}/conversations
   - `createConversation(agentId: number, threadId?: string)` - POST /conversations
   - `getConversationMessages(threadId: string)` - GET /conversations/{thread_id}/messages
   - `deleteConversation(threadId: string)` - DELETE /conversations/{thread_id}

3. **Update chat service** (`frontend/features/chat/services/chatService.ts`)
   - Add `thread_id?: string` parameter to `StreamChatOptions`
   - Extract `X-Thread-ID` header from response
   - Return thread_id from streamChat function

### Phase 2: State Management Migration
4. **Migrate useChat hook** (`frontend/features/chat/hooks/useChat.ts`)
   - Replace `messagesByAgent` with conversation-based state
   - Add `conversations`, `activeThreadId` to state
   - Load conversations when agent is selected
   - Handle conversation switching and message loading
   - Update onSubmit to include thread_id

### Phase 3: UI Components
5. **Update ConversationsSidebar** (`frontend/features/chat/components/ConversationsSidebar.tsx`)
   - Show conversations grouped by agent instead of just agents
   - Add "New Conversation" button for each agent
   - Handle conversation selection and deletion
   - Show conversation creation timestamps

6. **Update ChatPage** (`frontend/features/chat/components/ChatPage.tsx`)
   - Handle conversation-based message display
   - Update empty states for conversation selection
   - Pass conversation context to components

### Current State Analysis
- **Agent-centric**: Currently using `messagesByAgent: Record<number, UIMessage[]>`
- **Direct messages**: Messages loaded directly per agent via `/agents/{id}/messages`
- **No conversation context**: No thread persistence or conversation management

### Target State
- **Conversation-centric**: `conversations: Conversation[]`, `messagesByConversation: Record<string, UIMessage[]>`
- **Thread-aware**: All chat requests include thread_id for context preservation
- **Multi-conversation**: Users can maintain multiple conversations per agent