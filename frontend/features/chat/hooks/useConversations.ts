import { useCallback, useEffect, useState } from 'react'
import type { Conversation } from '../types'
import { getConversations, createConversation, deleteConversation } from '../services/conversationService'
import logger from '../../../lib/logger'

export interface UseConversationsState {
  conversations: Conversation[]
  activeThreadId: string | null
}

export interface UseConversationsApi extends UseConversationsState {
  setActiveThreadId: (threadId: string | null) => void
  createConversation: (agentId: number) => Promise<void>
  deleteConversation: (threadId: string) => Promise<void>
}

export function useConversations(agentId: number | null): UseConversationsApi {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

  // Load conversations for the given agent
  useEffect(() => {
    if (agentId == null) {
      // Clear state when no agent is selected
      setConversations([])
      setActiveThreadId(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const convs = await getConversations(agentId)
        if (cancelled) return
        setConversations(convs)
        // Set active thread to most recent conversation or null
        if (convs.length > 0 && activeThreadId == null) {
          setActiveThreadId(convs[0].thread_id)
        } else if (convs.length === 0) {
          setActiveThreadId(null)
        }
      } catch (e) {
        logger.error('Failed to load conversations for agent', agentId, e)
        setConversations([])
        setActiveThreadId(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [agentId])

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
      setConversations((prev) => {
        const remainingConversations = prev.filter(c => c.thread_id !== threadId)
        
        // Handle active conversation deletion
        if (activeThreadId === threadId) {
          if (remainingConversations.length > 0) {
            setActiveThreadId(remainingConversations[0].thread_id)
          } else {
            setActiveThreadId(null)
          }
        }
        
        return remainingConversations
      })
    } catch (e) {
      logger.error('Failed to delete conversation', e)
    }
  }, [activeThreadId])

  return {
    conversations,
    activeThreadId,
    setActiveThreadId,
    createConversation: handleCreateConversation,
    deleteConversation: handleDeleteConversation,
  }
}

export default useConversations