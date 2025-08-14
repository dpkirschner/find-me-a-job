import { API_BASE_URL } from '../../../lib/env'
import type { 
  ApiConversations, 
  ApiConversation, 
  ApiMessages, 
  CreateConversationRequest,
  Conversation 
} from '../types'

export async function getConversations(agentId: number): Promise<Conversation[]> {
  const response = await fetch(`${API_BASE_URL}/agents/${agentId}/conversations`, {
    cache: 'no-store',
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({} as any))
    throw new Error(err.detail || `HTTP ${response.status}`)
  }
  const data: ApiConversations = await response.json()
  return data.conversations
}

export async function createConversation(request: CreateConversationRequest): Promise<Conversation> {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    cache: 'no-store',
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({} as any))
    throw new Error(err.detail || `HTTP ${response.status}`)
  }
  const data: ApiConversation = await response.json()
  return data.conversation
}

export async function getConversationMessages(threadId: string): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/conversations/${threadId}/messages`, {
    cache: 'no-store',
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({} as any))
    throw new Error(err.detail || `HTTP ${response.status}`)
  }
  const data: ApiMessages = await response.json()
  return data.messages
}

export async function deleteConversation(threadId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/conversations/${threadId}`, {
    method: 'DELETE',
    cache: 'no-store',
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({} as any))
    throw new Error(err.detail || `HTTP ${response.status}`)
  }
}