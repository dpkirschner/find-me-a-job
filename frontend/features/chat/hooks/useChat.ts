import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Agent, UIMessage, Conversation } from '../types'
import { getAgents, getMessages, createAgent, deleteAgent } from '../services/agentService'
import { getConversations, createConversation, getConversationMessages, deleteConversation } from '../services/conversationService'
import { streamChat } from '../services/chatService'
import logger from '../../../lib/logger'

export interface UseChatState {
  agents: Agent[]
  activeAgentId: number | null
  conversations: Conversation[]
  activeThreadId: string | null
  messagesByConversation: Record<string, UIMessage[]>
  isLoading: boolean
  isStreaming: boolean
}

export interface UseChatApi extends UseChatState {
  setActiveAgentId: (id: number) => void
  setActiveThreadId: (threadId: string | null) => void
  input: string
  setInput: (v: string) => void
  onSubmit: (e?: React.FormEvent) => Promise<void>
  stop: () => void
  createAgent: (name: string) => Promise<void>
  deleteAgent: (agentId: number) => Promise<void>
  createConversation: (agentId: number) => Promise<void>
  deleteConversation: (threadId: string) => Promise<void>
}

export function useChat(): UseChatApi {
  const [agents, setAgents] = useState<Agent[]>([])
  const [activeAgentId, setActiveAgentId] = useState<number | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, UIMessage[]>>({})
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

  // Load conversations for active agent
  useEffect(() => {
    if (activeAgentId == null) return
    let cancelled = false
    ;(async () => {
      try {
        const convs = await getConversations(activeAgentId)
        if (cancelled) return
        setConversations(convs)
        // Set active thread to most recent conversation or null
        if (convs.length > 0 && activeThreadId == null) {
          setActiveThreadId(convs[0].thread_id)
        } else if (convs.length === 0) {
          setActiveThreadId(null)
        }
      } catch (e) {
        logger.error('Failed to load conversations for agent', activeAgentId, e)
        setConversations([])
        setActiveThreadId(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeAgentId])

  // Load messages for active conversation
  useEffect(() => {
    if (activeThreadId == null) return
    if (messagesByConversation[activeThreadId]) return
    let cancelled = false
    ;(async () => {
      try {
        const msgs = await getConversationMessages(activeThreadId)
        if (cancelled) return
        const formatted: UIMessage[] = msgs.map((m) => ({
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }))
        setMessagesByConversation((prev) => ({ ...prev, [activeThreadId]: formatted }))
      } catch (e) {
        logger.error('Failed to load messages for conversation', activeThreadId, e)
        setMessagesByConversation((prev) => ({ ...prev, [activeThreadId]: [] }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeThreadId, messagesByConversation])

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

    // If no active thread, we'll get one from the chat response
    const currentThreadId = activeThreadId
    
    // Always add messages to state - for new threads we'll move them later
    const tempThreadId = currentThreadId || `temp-${Date.now()}`
    setMessagesByConversation((prev) => ({
      ...prev,
      [tempThreadId]: [...(prev[tempThreadId] || []), userMsg, assistantMsg],
    }))
    setInput('')

    try {
      const result = await streamChat({
        message: userMsg.content,
        agentId: activeAgentId,
        threadId: currentThreadId || undefined,
        signal: controller.signal,
        onToken: (token) => {
          // Update the temp thread (could be current thread or temporary one)
          setMessagesByConversation((prev) => {
            const arr = [...(prev[tempThreadId] || [])]
            for (let i = arr.length - 1; i >= 0; i--) {
              if (arr[i].role === 'assistant') {
                arr[i] = { ...arr[i], content: (arr[i].content || '') + token }
                break
              }
            }
            return { ...prev, [tempThreadId]: arr }
          })
        },
      })

      // Handle new thread creation
      if (result.threadId && !currentThreadId) {
        setActiveThreadId(result.threadId)
        
        // Move messages from temp thread to the real thread
        setMessagesByConversation((prev) => {
          const messagesFromTemp = prev[tempThreadId] || []
          const newState = { ...prev, [result.threadId!]: messagesFromTemp }
          delete newState[tempThreadId] // Remove the temporary thread
          return newState
        })
        
        // Refresh conversations to include the new one
        if (activeAgentId) {
          try {
            const convs = await getConversations(activeAgentId)
            setConversations(convs)
          } catch (e) {
            logger.error('Failed to refresh conversations', e)
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        logger.info('Aborted by user')
        setMessagesByConversation((prev) => {
          const arr = [...(prev[tempThreadId] || [])]
          const last = arr[arr.length - 1]
          if (last && last.role === 'assistant') last.content += '\n\n(Request stopped)'
          return { ...prev, [tempThreadId]: arr }
        })
      } else {
        logger.error('Stream error', err)
        setMessagesByConversation((prev) => {
          const arr = [...(prev[tempThreadId] || [])]
          const last = arr[arr.length - 1]
          if (last && last.role === 'assistant') last.content = err?.message || 'Unknown error'
          return { ...prev, [tempThreadId]: arr }
        })
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [input, isLoading, activeAgentId, activeThreadId])

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

  const handleDeleteAgent = useCallback(async (agentId: number) => {
    try {
      await deleteAgent(agentId)
      setAgents((prev) => prev.filter(a => a.id !== agentId))
      
      // Clean up conversations and messages for deleted agent
      setConversations((prev) => prev.filter(c => c.agent_id !== agentId))
      setMessagesByConversation((prev) => {
        const newMessages = { ...prev }
        conversations.forEach(conv => {
          if (conv.agent_id === agentId) {
            delete newMessages[conv.thread_id]
          }
        })
        return newMessages
      })
      
      // Handle active agent deletion
      if (activeAgentId === agentId) {
        setActiveThreadId(null)
        setAgents((currentAgents) => {
          const remainingAgents = currentAgents.filter(a => a.id !== agentId)
          if (remainingAgents.length > 0) {
            setActiveAgentId(remainingAgents[0].id)
          } else {
            setActiveAgentId(null)
          }
          return remainingAgents
        })
      }
    } catch (e) {
      logger.error('Failed to delete agent', e)
    }
  }, [activeAgentId, conversations])

  const handleCreateConversation = useCallback(async (agentId: number) => {
    try {
      const newConv = await createConversation({ agent_id: agentId })
      setConversations((prev) => [newConv, ...prev])
      setActiveThreadId(newConv.thread_id)
    } catch (e) {
      logger.error('Failed to create conversation', e)
    }
  }, [])

  const handleDeleteConversation = useCallback(async (threadId: string) => {
    try {
      await deleteConversation(threadId)
      setConversations((prev) => prev.filter(c => c.thread_id !== threadId))
      
      // Clean up messages for deleted conversation
      setMessagesByConversation((prev) => {
        const { [threadId]: deleted, ...rest } = prev
        return rest
      })
      
      // Handle active conversation deletion
      if (activeThreadId === threadId) {
        const remainingConversations = conversations.filter(c => c.thread_id !== threadId)
        if (remainingConversations.length > 0) {
          setActiveThreadId(remainingConversations[0].thread_id)
        } else {
          setActiveThreadId(null)
        }
      }
    } catch (e) {
      logger.error('Failed to delete conversation', e)
    }
  }, [activeThreadId, conversations])

  return {
    agents,
    activeAgentId,
    conversations,
    activeThreadId,
    messagesByConversation,
    isLoading,
    isStreaming,
    setActiveAgentId: (id: number) => {
      setActiveAgentId(id)
      setActiveThreadId(null) // Reset active thread when switching agents
    },
    setActiveThreadId,
    input,
    setInput,
    onSubmit,
    stop,
    createAgent: handleCreateAgent,
    deleteAgent: handleDeleteAgent,
    createConversation: handleCreateConversation,
    deleteConversation: handleDeleteConversation,
  }
}

export default useChat


