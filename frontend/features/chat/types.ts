export interface Agent { id: number; name: string }
export interface ApiAgents { agents: Agent[] }

export interface Conversation {
  id: number
  agent_id: number
  thread_id: string
  created_at: string
  updated_at: string
}

export interface ApiConversations { conversations: Conversation[] }

export interface CreateConversationRequest {
  agent_id: number
  thread_id?: string
}

export interface ApiConversation { conversation: Conversation }

export type Role = 'user' | 'assistant' | 'system'

export interface ApiMessage {
  id: number
  agent_id: number
  role: Role
  content: string
  created_at: string
}

export interface ApiMessages { messages: ApiMessage[] }

export interface UIMessage {
  role: Role
  content: string
  id?: string
  created_at?: string
}

export interface ChatRequest {
  message: string
  agent_id: number
  thread_id?: string
}


