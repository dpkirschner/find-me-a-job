import { useCallback, useEffect, useState } from 'react'
import type { Agent } from '../types'
import { getAgents, createAgent, updateAgent, deleteAgent } from '../services/agentService'
import logger from '../../../lib/logger'

export interface UseAgentsState {
  agents: Agent[]
  activeAgentId: number | null
}

export interface UseAgentsApi extends UseAgentsState {
  setActiveAgentId: (id: number | null) => void
  createAgent: (name: string, systemPrompt?: string) => Promise<void>
  updateAgent: (agentId: number, name: string, systemPrompt?: string) => Promise<void>
  deleteAgent: (agentId: number) => Promise<void>
}

export function useAgents(): UseAgentsApi {
  const [agents, setAgents] = useState<Agent[]>([])
  const [activeAgentId, setActiveAgentId] = useState<number | null>(null)

  // Load agents on mount
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

  const handleCreateAgent = useCallback(async (name: string, systemPrompt?: string) => {
    try {
      const newAgent = await createAgent(name, systemPrompt)
      setAgents((prev) => [...prev, newAgent])
      setActiveAgentId(newAgent.id)
    } catch (e) {
      logger.error('Failed to create agent', e)
    }
  }, [])

  const handleUpdateAgent = useCallback(async (agentId: number, name: string, systemPrompt?: string) => {
    try {
      const updatedAgent = await updateAgent(agentId, name, systemPrompt)
      setAgents((prev) => prev.map(agent => 
        agent.id === agentId ? updatedAgent : agent
      ))
    } catch (e) {
      logger.error('Failed to update agent', e)
    }
  }, [])

  const handleDeleteAgent = useCallback(async (agentId: number) => {
    try {
      await deleteAgent(agentId)
      setAgents((prev) => {
        const remainingAgents = prev.filter(a => a.id !== agentId)
        
        // Handle active agent deletion
        if (activeAgentId === agentId) {
          if (remainingAgents.length > 0) {
            setActiveAgentId(remainingAgents[0].id)
          } else {
            setActiveAgentId(null)
          }
        }
        
        return remainingAgents
      })
    } catch (e) {
      logger.error('Failed to delete agent', e)
    }
  }, [activeAgentId])

  return {
    agents,
    activeAgentId,
    setActiveAgentId,
    createAgent: handleCreateAgent,
    updateAgent: handleUpdateAgent,
    deleteAgent: handleDeleteAgent,
  }
}

export default useAgents