import React from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useAgents } from '../useAgents'
import * as agentService from '../../services/agentService'
import type { Agent } from '../../types'

// Mock the agent service
jest.mock('../../services/agentService')
const mockedAgentService = agentService as jest.Mocked<typeof agentService>

// Mock logger
jest.mock('../../../../lib/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}))

// React 19 testing - suppress act() warnings for async hook state updates
// These warnings are expected when testing custom hooks that update state asynchronously
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('not wrapped in act') || 
       args[0].includes('TestComponent inside a test was not wrapped'))
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})

describe('useAgents', () => {
  const mockAgents: Agent[] = [
    { id: 1, name: 'Agent A', system_prompt: 'You are helpful.' },
    { id: 2, name: 'Agent B', system_prompt: null },
    { id: 3, name: 'Agent C', system_prompt: 'You are creative.' },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockedAgentService.getAgents.mockResolvedValue(mockAgents)
    mockedAgentService.createAgent.mockResolvedValue({ id: 4, name: 'New Agent', system_prompt: 'New prompt' })
    mockedAgentService.updateAgent.mockImplementation((id) => 
      Promise.resolve({ id, name: 'Updated Agent', system_prompt: 'Updated prompt' })
    )
    mockedAgentService.deleteAgent.mockResolvedValue()
  })

  describe('Initial State and Loading', () => {
    test('initializes with empty agents array and no active agent', () => {
      const { result } = renderHook(() => useAgents())

      expect(result.current.agents).toEqual([])
      expect(result.current.activeAgentId).toBeNull()
    })

    test('loads agents on mount', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      expect(mockedAgentService.getAgents).toHaveBeenCalledTimes(1)
    })

    test('sets first agent as active when agents are loaded and no active agent exists', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.activeAgentId).toBe(1)
      })
    })

    test('does not change active agent if one is already set', async () => {
      const { result } = renderHook(() => useAgents())

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      // Manually set active agent
      act(() => {
        result.current.setActiveAgentId(2)
      })

      expect(result.current.activeAgentId).toBe(2)

      // Trigger another load (shouldn't change active agent)
      await waitFor(() => {
        expect(result.current.activeAgentId).toBe(2)
      })
    })

    test('handles loading error gracefully', async () => {
      const error = new Error('Failed to load agents')
      mockedAgentService.getAgents.mockRejectedValueOnce(error)

      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual([])
      })

      expect(mockedAgentService.getAgents).toHaveBeenCalledTimes(1)
    })
  })

  describe('setActiveAgentId', () => {
    test('updates active agent ID', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      act(() => {
        result.current.setActiveAgentId(2)
      })

      expect(result.current.activeAgentId).toBe(2)
    })

    test('allows setting active agent to null', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.activeAgentId).toBe(1)
      })

      act(() => {
        result.current.setActiveAgentId(null)
      })

      expect(result.current.activeAgentId).toBeNull()
    })
  })

  describe('createAgent', () => {
    test('creates agent with name only', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      await act(async () => {
        await result.current.createAgent('New Agent')
      })

      expect(mockedAgentService.createAgent).toHaveBeenCalledWith('New Agent', undefined)
      expect(result.current.agents).toHaveLength(4)
      expect(result.current.agents[3]).toEqual({ id: 4, name: 'New Agent', system_prompt: 'New prompt' })
      expect(result.current.activeAgentId).toBe(4)
    })

    test('creates agent with name and system prompt', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      await act(async () => {
        await result.current.createAgent('New Agent', 'Custom prompt')
      })

      expect(mockedAgentService.createAgent).toHaveBeenCalledWith('New Agent', 'Custom prompt')
      expect(result.current.agents).toHaveLength(4)
      expect(result.current.activeAgentId).toBe(4)
    })

    test('handles creation error gracefully', async () => {
      const error = new Error('Failed to create agent')
      mockedAgentService.createAgent.mockRejectedValueOnce(error)

      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      const initialAgentsLength = result.current.agents.length
      const initialActiveAgentId = result.current.activeAgentId

      await act(async () => {
        await result.current.createAgent('New Agent')
      })

      expect(mockedAgentService.createAgent).toHaveBeenCalledWith('New Agent', undefined)
      expect(result.current.agents).toHaveLength(initialAgentsLength)
      expect(result.current.activeAgentId).toBe(initialActiveAgentId)
    })

    test('sets newly created agent as active', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      // Set a different agent as active first
      act(() => {
        result.current.setActiveAgentId(2)
      })

      await act(async () => {
        await result.current.createAgent('New Agent')
      })

      expect(result.current.activeAgentId).toBe(4) // New agent's ID
    })
  })

  describe('updateAgent', () => {
    test('updates agent with new name', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      await act(async () => {
        await result.current.updateAgent(1, 'Updated Name', 'Original prompt')
      })

      expect(mockedAgentService.updateAgent).toHaveBeenCalledWith(1, 'Updated Name', 'Original prompt')
      
      const updatedAgent = result.current.agents.find(a => a.id === 1)
      expect(updatedAgent).toEqual({ id: 1, name: 'Updated Agent', system_prompt: 'Updated prompt' })
    })

    test('updates agent with new system prompt', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      await act(async () => {
        await result.current.updateAgent(1, 'Agent A', 'New system prompt')
      })

      expect(mockedAgentService.updateAgent).toHaveBeenCalledWith(1, 'Agent A', 'New system prompt')
    })

    test('updates agent with both name and system prompt', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      await act(async () => {
        await result.current.updateAgent(1, 'Completely Updated', 'Completely new prompt')
      })

      expect(mockedAgentService.updateAgent).toHaveBeenCalledWith(1, 'Completely Updated', 'Completely new prompt')
    })

    test('updates correct agent in agents array', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      await act(async () => {
        await result.current.updateAgent(2, 'Updated Agent B', 'Updated prompt B')
      })

      // Agent 2 should be updated
      const updatedAgent = result.current.agents.find(a => a.id === 2)
      expect(updatedAgent).toEqual({ id: 2, name: 'Updated Agent', system_prompt: 'Updated prompt' })
      
      // Other agents should remain unchanged
      const unchangedAgent1 = result.current.agents.find(a => a.id === 1)
      const unchangedAgent3 = result.current.agents.find(a => a.id === 3)
      expect(unchangedAgent1).toEqual(mockAgents[0])
      expect(unchangedAgent3).toEqual(mockAgents[2])
    })

    test('handles update error gracefully', async () => {
      const error = new Error('Failed to update agent')
      mockedAgentService.updateAgent.mockRejectedValueOnce(error)

      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      const originalAgents = result.current.agents

      await act(async () => {
        await result.current.updateAgent(1, 'Updated Name', 'Updated prompt')
      })

      expect(mockedAgentService.updateAgent).toHaveBeenCalledWith(1, 'Updated Name', 'Updated prompt')
      expect(result.current.agents).toEqual(originalAgents) // Should remain unchanged
    })

    test('handles updating non-existent agent', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      await act(async () => {
        await result.current.updateAgent(999, 'Non-existent', 'prompt')
      })

      expect(mockedAgentService.updateAgent).toHaveBeenCalledWith(999, 'Non-existent', 'prompt')
      // Agents array should be unchanged since agent 999 doesn't exist
      expect(result.current.agents).toEqual(mockAgents)
    })
  })

  describe('deleteAgent', () => {
    test('deletes agent successfully', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      await act(async () => {
        await result.current.deleteAgent(2)
      })

      expect(mockedAgentService.deleteAgent).toHaveBeenCalledWith(2)
      expect(result.current.agents).toHaveLength(2)
      expect(result.current.agents.find(a => a.id === 2)).toBeUndefined()
    })

    test('sets new active agent when deleting current active agent', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
        expect(result.current.activeAgentId).toBe(1)
      })

      await act(async () => {
        await result.current.deleteAgent(1)
      })

      expect(result.current.activeAgentId).toBe(2) // Should be the first remaining agent
    })

    test('sets active agent to null when deleting last agent', async () => {
      // Mock a single agent
      mockedAgentService.getAgents.mockResolvedValueOnce([mockAgents[0]])
      
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toHaveLength(1)
        expect(result.current.activeAgentId).toBe(1)
      })

      await act(async () => {
        await result.current.deleteAgent(1)
      })

      expect(result.current.agents).toHaveLength(0)
      expect(result.current.activeAgentId).toBeNull()
    })

    test('does not change active agent when deleting non-active agent', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
        expect(result.current.activeAgentId).toBe(1)
      })

      await act(async () => {
        await result.current.deleteAgent(3)
      })

      expect(result.current.activeAgentId).toBe(1) // Should remain unchanged
      expect(result.current.agents).toHaveLength(2)
    })

    test('handles deletion error gracefully', async () => {
      const error = new Error('Failed to delete agent')
      mockedAgentService.deleteAgent.mockRejectedValueOnce(error)

      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      const originalAgents = result.current.agents
      const originalActiveAgentId = result.current.activeAgentId

      await act(async () => {
        await result.current.deleteAgent(1)
      })

      expect(mockedAgentService.deleteAgent).toHaveBeenCalledWith(1)
      expect(result.current.agents).toEqual(originalAgents) // Should remain unchanged
      expect(result.current.activeAgentId).toBe(originalActiveAgentId)
    })
  })

  describe('Edge Cases', () => {
    test('handles empty agents list on load', async () => {
      mockedAgentService.getAgents.mockResolvedValueOnce([])

      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual([])
      })

      expect(result.current.activeAgentId).toBeNull()
    })

    test('handles agents with various system prompt values', async () => {
      const diverseAgents: Agent[] = [
        { id: 1, name: 'Agent 1', system_prompt: 'Normal prompt' },
        { id: 2, name: 'Agent 2', system_prompt: '' },
        { id: 3, name: 'Agent 3', system_prompt: null },
        { id: 4, name: 'Agent 4', system_prompt: '   ' },
      ]
      mockedAgentService.getAgents.mockResolvedValueOnce(diverseAgents)

      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(diverseAgents)
      })

      expect(result.current.agents).toHaveLength(4)
    })

    test('handles concurrent operations', async () => {
      const { result } = renderHook(() => useAgents())

      await waitFor(() => {
        expect(result.current.agents).toEqual(mockAgents)
      })

      // Simulate concurrent create and delete operations
      await act(async () => {
        const createPromise = result.current.createAgent('Concurrent Agent')
        const deletePromise = result.current.deleteAgent(3)
        
        await Promise.all([createPromise, deletePromise])
      })

      expect(mockedAgentService.createAgent).toHaveBeenCalledWith('Concurrent Agent', undefined)
      expect(mockedAgentService.deleteAgent).toHaveBeenCalledWith(3)
    })
  })

  describe('Component Cleanup', () => {
    test('cancels pending operations when component unmounts', async () => {
      // This test ensures the cleanup function in useEffect works
      const { result, unmount } = renderHook(() => useAgents())

      // Start loading
      expect(result.current.agents).toEqual([])

      // Unmount before loading completes
      unmount()

      // Wait a bit to ensure any pending operations are cancelled
      await new Promise(resolve => setTimeout(resolve, 10))

      // The component should handle this gracefully without errors
      expect(mockedAgentService.getAgents).toHaveBeenCalledTimes(1)
    })
  })
})