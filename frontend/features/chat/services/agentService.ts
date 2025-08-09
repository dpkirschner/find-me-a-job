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


