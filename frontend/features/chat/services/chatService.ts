import { API_BASE_URL } from '../../../lib/env'
import { readTextEventStream } from '../../../lib/sse'

export interface StreamChatOptions {
  message: string
  agentId: number
  signal?: AbortSignal
  onToken: (token: string) => void
}

export async function streamChat({ message, agentId, signal, onToken }: StreamChatOptions): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, agent_id: agentId }),
    signal,
    cache: 'no-store',
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({} as any))
    throw new Error(err.detail || `HTTP ${response.status}`)
  }
  await readTextEventStream(response, onToken, { signal })
}


