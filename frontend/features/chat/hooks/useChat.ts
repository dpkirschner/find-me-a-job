import { useCallback, useEffect, useRef, useState } from 'react'
import type { UIMessage } from '../types'
import { getConversations, getConversationMessages } from '../services/conversationService'
import { streamChat } from '../services/chatService'
import logger from '../../../lib/logger'
import { useAgents } from './useAgents'
import { useConversations } from './useConversations'

import type { UseAgentsApi } from './useAgents'
import type { UseConversationsApi } from './useConversations'

export interface UseChatState {
  messagesByConversation: Record<string, UIMessage[]>
  isLoading: boolean
  isStreaming: boolean
  input: string
}

export interface UseChatApi extends UseAgentsApi, UseConversationsApi, UseChatState {
  setInput: (v: string) => void
  onSubmit: (e?: React.FormEvent) => Promise<void>
  stop: () => void
}

export function useChat(): UseChatApi {
  // Compose the hooks
  const agentsApi = useAgents()
  const conversationsApi = useConversations(agentsApi.activeAgentId)
  
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, UIMessage[]>>({})
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Clear messages when switching agents
  useEffect(() => {
    if (agentsApi.activeAgentId === null) {
      setMessagesByConversation({})
    }
  }, [agentsApi.activeAgentId])

  // Load messages for active conversation
  useEffect(() => {
    if (conversationsApi.activeThreadId == null) return
    if (messagesByConversation[conversationsApi.activeThreadId]) return
    let cancelled = false
    ;(async () => {
      try {
        const msgs = await getConversationMessages(conversationsApi.activeThreadId!)
        if (cancelled) return
        const formatted: UIMessage[] = msgs.map((m) => ({
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }))
        setMessagesByConversation((prev) => ({ ...prev, [conversationsApi.activeThreadId!]: formatted }))
      } catch (e) {
        logger.error('Failed to load messages for conversation', conversationsApi.activeThreadId, e)
        setMessagesByConversation((prev) => ({ ...prev, [conversationsApi.activeThreadId!]: [] }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [conversationsApi.activeThreadId, messagesByConversation])

  const onSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!input.trim() || isLoading || agentsApi.activeAgentId == null) return

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
    const currentThreadId = conversationsApi.activeThreadId
    
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
        agentId: agentsApi.activeAgentId,
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
        conversationsApi.setActiveThreadId(result.threadId)
        
        // Move messages from temp thread to the real thread
        setMessagesByConversation((prev) => {
          const messagesFromTemp = prev[tempThreadId] || []
          const newState = { ...prev, [result.threadId!]: messagesFromTemp }
          delete newState[tempThreadId] // Remove the temporary thread
          return newState
        })
        
        // The useConversations hook will automatically refresh when activeThreadId changes
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
  }, [input, isLoading, agentsApi.activeAgentId, conversationsApi.activeThreadId])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  // Enhanced deleteAgent handler that cleans up messages
  const enhancedDeleteAgent = useCallback(async (agentId: number) => {
    // Clean up messages for all conversations of this agent
    setMessagesByConversation((prev) => {
      const newMessages = { ...prev }
      conversationsApi.conversations.forEach(conv => {
        if (conv.agent_id === agentId) {
          delete newMessages[conv.thread_id]
        }
      })
      return newMessages
    })
    
    // Call the original delete handler
    await agentsApi.deleteAgent(agentId)
  }, [agentsApi.deleteAgent, conversationsApi.conversations])

  // Enhanced deleteConversation handler that cleans up messages
  const enhancedDeleteConversation = useCallback(async (threadId: string) => {
    // Clean up messages for the deleted conversation
    setMessagesByConversation((prev) => {
      const { [threadId]: deleted, ...rest } = prev
      return rest
    })
    
    // Call the original delete handler
    await conversationsApi.deleteConversation(threadId)
  }, [conversationsApi.deleteConversation])

  return {
    // From useAgents
    ...agentsApi,
    // From useConversations
    ...conversationsApi,
    // Chat-specific state
    messagesByConversation,
    isLoading,
    isStreaming,
    input,
    setInput,
    onSubmit,
    stop,
    // Enhanced handlers
    deleteAgent: enhancedDeleteAgent,
    deleteConversation: enhancedDeleteConversation,
  }
}

export default useChat


