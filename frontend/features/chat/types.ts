export interface Agent { id: number; name: string }
export interface ApiAgents { agents: Agent[] }

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


