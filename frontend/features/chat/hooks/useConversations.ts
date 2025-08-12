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
  refreshConversations: () => Promise<void>
  addPlaceholderConversation: (tempThreadId: string) => void
  replacePlaceholderWithReal: (tempThreadId: string, realThreadId: string) => Promise<void>
  removePlaceholder: (tempThreadId: string) => void
}

export function useConversations(agentId: number | null): UseConversationsApi {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

  // Function to load conversations for the current agent
  const loadConversations = useCallback(async (shouldSetActiveThread = true) => {
    if (agentId == null) {
      // Clear state when no agent is selected
      setConversations([])
      setActiveThreadId(null)
      return
    }

    try {
      const convs = await getConversations(agentId)
      setConversations(convs)
      // Set active thread to most recent conversation for this agent
      if (shouldSetActiveThread) {
        if (convs.length > 0) {
          setActiveThreadId(convs[0].thread_id)
        } else {
          setActiveThreadId(null)
        }
      }
    } catch (e) {
      if (e instanceof Error) {
        if (e.message.includes('404')) {
          logger.warn(`Agent ${agentId} not found`)
        } else if (e.message === 'Failed to fetch') {
          logger.error(`Cannot connect to backend server when loading conversations for agent ${agentId}`)
        } else {
          logger.error('Failed to load conversations for agent', agentId, e)
        }
      } else {
        logger.error('Unknown error loading conversations for agent', agentId, e)
      }
      setConversations([])
      if (shouldSetActiveThread) {
        setActiveThreadId(null)
      }
    }
  }, [agentId])

  // Load conversations when agent changes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!cancelled) {
        await loadConversations()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadConversations])

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

  // Public refresh function
  const refreshConversations = useCallback(async () => {
    await loadConversations(false) // Don't change active thread when refreshing
  }, [loadConversations])

  // Note: Automatic refresh is now handled by explicit placeholder management in useChat

  // Add a placeholder conversation to show immediate feedback
  const addPlaceholderConversation = useCallback((tempThreadId: string) => {
    if (agentId == null) return
    
    const placeholder: Conversation = {
      id: -1, // Temporary ID
      agent_id: agentId,
      thread_id: tempThreadId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    setConversations(prev => [placeholder, ...prev])
  }, [agentId])

  // Replace placeholder with real conversation data
  const replacePlaceholderWithReal = useCallback(async (tempThreadId: string, realThreadId: string) => {
    // First remove the placeholder
    setConversations(prev => prev.filter(c => c.thread_id !== tempThreadId))
    
    // Then refresh to get the real conversation
    await loadConversations(false)
  }, [loadConversations])

  // Remove placeholder (e.g., on error)
  const removePlaceholder = useCallback((tempThreadId: string) => {
    setConversations(prev => prev.filter(c => c.thread_id !== tempThreadId))
  }, [])

  return {
    conversations,
    activeThreadId,
    setActiveThreadId,
    createConversation: handleCreateConversation,
    deleteConversation: handleDeleteConversation,
    refreshConversations,
    addPlaceholderConversation,
    replacePlaceholderWithReal,
    removePlaceholder,
  }
}

export default useConversations