import { API_BASE_URL } from '../../../lib/env'
import { readTextEventStream } from '../../../lib/sse'

export interface StreamChatOptions {
  message: string
  agentId: number
  threadId?: string
  signal?: AbortSignal
  onToken: (token: string) => void
}

export interface StreamChatResult {
  threadId: string | null
}

export async function streamChat({ message, agentId, threadId, signal, onToken }: StreamChatOptions): Promise<StreamChatResult> {
  const requestBody: any = { message, agent_id: agentId }
  if (threadId) {
    requestBody.thread_id = threadId
  }

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
    cache: 'no-store',
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({} as any))
    throw new Error(err.detail || `HTTP ${response.status}`)
  }
  
  const responseThreadId = response.headers?.get('X-Thread-ID') || null
  
  await readTextEventStream(response, onToken, { signal })
  
  return { threadId: responseThreadId }
}


