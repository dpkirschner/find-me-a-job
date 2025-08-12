import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Agent, UIMessage } from '../types'
import { getAgents, getMessages, createAgent } from '../services/agentService'
import { streamChat } from '../services/chatService'
import logger from '../../../lib/logger'

export interface UseChatState {
  agents: Agent[]
  activeAgentId: number | null
  messagesByAgent: Record<number, UIMessage[]>
  isLoading: boolean
  isStreaming: boolean
}

export interface UseChatApi extends UseChatState {
  setActiveAgentId: (id: number) => void
  input: string
  setInput: (v: string) => void
  onSubmit: (e?: React.FormEvent) => Promise<void>
  stop: () => void
  createAgent: (name: string) => Promise<void>
}

export function useChat(): UseChatApi {
  const [agents, setAgents] = useState<Agent[]>([])
  const [activeAgentId, setActiveAgentId] = useState<number | null>(null)
  const [messagesByAgent, setMessagesByAgent] = useState<Record<number, UIMessage[]>>({})
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Load agents
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await getAgents()
        if (cancelled) return
        setAgents(list)
        if (list.length && activeAgentId == null) setActiveAgentId(list[0].id)
      } catch (e) {
        logger.error('Failed to load agents', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Load messages for active agent lazily
  useEffect(() => {
    if (activeAgentId == null) return
    if (messagesByAgent[activeAgentId]) return
    let cancelled = false
    ;(async () => {
      try {
        const msgs = await getMessages(activeAgentId)
        if (cancelled) return
        const formatted: UIMessage[] = msgs.map((m) => ({
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }))
        setMessagesByAgent((prev) => ({ ...prev, [activeAgentId]: formatted }))
      } catch (e) {
        logger.error('Failed to load messages for agent', activeAgentId, e)
        setMessagesByAgent((prev) => ({ ...prev, [activeAgentId]: [] }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeAgentId, messagesByAgent])

  const onSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!input.trim() || isLoading || activeAgentId == null) return

    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)
    setIsStreaming(true)

    const userMsg: UIMessage = {
      role: 'user',
      content: input,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    }
    const assistantMsg: UIMessage = {
      role: 'assistant',
      content: '',
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    }
    setMessagesByAgent((prev) => ({
      ...prev,
      [activeAgentId]: [...(prev[activeAgentId] || []), userMsg, assistantMsg],
    }))
    setInput('')

    try {
      await streamChat({
        message: userMsg.content,
        agentId: activeAgentId,
        signal: controller.signal,
        onToken: (token) => {
          setMessagesByAgent((prev) => {
            const arr = [...(prev[activeAgentId] || [])]
            for (let i = arr.length - 1; i >= 0; i--) {
              if (arr[i].role === 'assistant') {
                arr[i] = { ...arr[i], content: (arr[i].content || '') + token }
                break
              }
            }
            return { ...prev, [activeAgentId]: arr }
          })
        },
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        logger.info('Aborted by user')
        setMessagesByAgent((prev) => {
          const arr = [...(prev[activeAgentId] || [])]
          const last = arr[arr.length - 1]
          if (last && last.role === 'assistant') last.content += '\n\n(Request stopped)'
          return { ...prev, [activeAgentId]: arr }
        })
      } else {
        logger.error('Stream error', err)
        setMessagesByAgent((prev) => {
          const arr = [...(prev[activeAgentId] || [])]
          const last = arr[arr.length - 1]
          if (last && last.role === 'assistant') last.content = err?.message || 'Unknown error'
          return { ...prev, [activeAgentId]: arr }
        })
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [input, isLoading, activeAgentId])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const handleCreateAgent = useCallback(async (name: string) => {
    try {
      const newAgent = await createAgent(name)
      setAgents((prev) => [...prev, newAgent])
      setActiveAgentId(newAgent.id)
    } catch (e) {
      logger.error('Failed to create agent', e)
    }
  }, [])

  return {
    agents,
    activeAgentId,
    messagesByAgent,
    isLoading,
    isStreaming,
    setActiveAgentId: (id: number) => setActiveAgentId(id),
    input,
    setInput,
    onSubmit,
    stop,
    createAgent: handleCreateAgent,
  }
}

export default useChat


