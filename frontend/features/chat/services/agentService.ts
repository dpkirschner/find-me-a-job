import { API_BASE_URL } from '../../../lib/env'
import type { Agent, ApiAgents, ApiMessages } from '../types'

export async function getAgents(): Promise<Agent[]> {
  const res = await fetch(`${API_BASE_URL}/agents`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed agents: ${res.status}`)
  const data: ApiAgents = await res.json()
  return data.agents
}

export async function getMessages(agentId: number): Promise<ApiMessages['messages']> {
  const res = await fetch(`${API_BASE_URL}/agents/${agentId}/messages`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed messages: ${res.status}`)
  const data: ApiMessages = await res.json()
  return data.messages
}

export async function createAgent(name: string): Promise<Agent> {
  const res = await fetch(`${API_BASE_URL}/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`Failed to create agent: ${res.status}`)
  const data = await res.json()
  return data.agent
}

export async function deleteAgent(agentId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/agents/${agentId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Failed to delete agent: ${res.status}`)
}


