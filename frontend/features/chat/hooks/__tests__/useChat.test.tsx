import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import useChat from '../../hooks/useChat'
import logger from '../../../../lib/logger'

// Mock service dependencies
const mockGetAgents = jest.fn()
const mockGetMessages = jest.fn()
const mockGetConversations = jest.fn()
const mockGetConversationMessages = jest.fn()
const mockCreateConversation = jest.fn()
const mockDeleteConversation = jest.fn()
const mockStreamChat = jest.fn()

jest.mock('../../services/agentService', () => ({
  __esModule: true,
  getAgents: (...args: any[]) => mockGetAgents(...args),
  getMessages: (...args: any[]) => mockGetMessages(...args),
}))

jest.mock('../../services/conversationService', () => ({
  __esModule: true,
  getConversations: (...args: any[]) => mockGetConversations(...args),
  getConversationMessages: (...args: any[]) => mockGetConversationMessages(...args),
  createConversation: (...args: any[]) => mockCreateConversation(...args),
  deleteConversation: (...args: any[]) => mockDeleteConversation(...args),
}))

jest.mock('../../services/chatService', () => ({
  __esModule: true,
  streamChat: (...args: any[]) => mockStreamChat(...args),
}))

jest.mock('../../../../lib/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}))

describe('useChat', () => {
  const defaultAgents = [
    { id: 1, name: 'Agent A' },
    { id: 2, name: 'Agent B' },
  ]

  const defaultConversations = [
    { id: 1, agent_id: 1, thread_id: 'thread-1', created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:01:00Z' },
    { id: 2, agent_id: 2, thread_id: 'thread-2', created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:01:00Z' },
  ]

  const defaultMessages = [
    { id: 1, agent_id: 1, role: 'user' as const, content: 'Hello', created_at: '2020-01-01T00:00:00Z' },
    { id: 2, agent_id: 1, role: 'assistant' as const, content: 'Hi there!', created_at: '2020-01-01T00:01:00Z' },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAgents.mockResolvedValue(defaultAgents)
    mockGetMessages.mockResolvedValue(defaultMessages)
    mockGetConversations.mockImplementation((agentId: number) => {
      return Promise.resolve(defaultConversations.filter(c => c.agent_id === agentId))
    })
    mockGetConversationMessages.mockResolvedValue(defaultMessages)
    mockCreateConversation.mockResolvedValue(defaultConversations[0])
    mockDeleteConversation.mockResolvedValue(undefined)
    mockStreamChat.mockImplementation(async ({ onToken }: any) => {
      onToken('Hello')
      onToken(' from')
      onToken(' assistant')
      return { threadId: 'new-thread-id' }
    })
    jest.clearAllTimers()
  })

  describe('Initialization', () => {
    test('provides initial state with empty data', async () => {
      const { result } = renderHook(() => useChat())

      expect(result.current.agents).toEqual([])
      expect(result.current.activeAgentId).toBeNull()
      expect(result.current.conversations).toEqual([])
      expect(result.current.activeThreadId).toBeNull()
      expect(result.current.messagesByConversation).toEqual({})
      expect(result.current.input).toBe('')
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isStreaming).toBe(false)

      await waitFor(() => {
        expect(result.current.agents.length).toBeGreaterThan(0)
      })
    })

    test('loads agents on mount and sets first as active', async () => {
      const { result } = renderHook(() => useChat())

      await waitFor(() => {
        expect(result.current.agents).toHaveLength(2)
      })

      expect(result.current.agents).toEqual(defaultAgents)
      expect(result.current.activeAgentId).toBe(1)
      expect(mockGetAgents).toHaveBeenCalledTimes(1)
    })

    test('handles agent loading failure gracefully', async () => {
      mockGetAgents.mockRejectedValueOnce(new Error('Network error'))
      const { result } = renderHook(() => useChat())

      await waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith('Failed to load agents', expect.any(Error))
      })

      expect(result.current.agents).toEqual([])
      expect(result.current.activeAgentId).toBeNull()
    })
  })

  describe('Agent Selection', () => {
    test('loads conversations and messages when agent is selected', async () => {
      const { result } = renderHook(() => useChat())

      await waitFor(() => {
        expect(result.current.activeAgentId).toBe(1)
      })

      await waitFor(() => {
        expect(result.current.conversations.length).toBeGreaterThan(0)
      })

      await waitFor(() => {
        expect(result.current.activeThreadId).toBe('thread-1')
      })

      await waitFor(() => {
        expect(result.current.messagesByConversation['thread-1']).toBeDefined()
      })

      expect(result.current.messagesByConversation['thread-1']).toHaveLength(2)
      expect(mockGetConversations).toHaveBeenCalledWith(1)
      expect(mockGetConversationMessages).toHaveBeenCalledWith('thread-1')
    })

    test('switches to different agent and loads its conversations', async () => {
      const { result } = renderHook(() => useChat())

      await waitFor(() => {
        expect(result.current.activeAgentId).toBe(1)
      })

      act(() => {
        result.current.setActiveAgentId(2)
      })

      expect(result.current.activeAgentId).toBe(2)

      await waitFor(() => {
        expect(result.current.conversations.length).toBeGreaterThan(0)
      })

      expect(mockGetConversations).toHaveBeenCalledWith(2)
    })

    test('handles conversation loading failure gracefully', async () => {
      mockGetConversations.mockRejectedValueOnce(new Error('Failed to load conversations'))
      const { result } = renderHook(() => useChat())

      await waitFor(() => {
        expect(result.current.activeAgentId).toBe(1)
      })

      await waitFor(() => {
        expect(result.current.conversations).toEqual([])
      })

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to load conversations for agent',
        1,
        expect.any(Error)
      )
    })
  })

  describe('Message Input', () => {
    test('updates input value when setInput is called', async () => {
      const { result } = renderHook(() => useChat())

      act(() => {
        result.current.setInput('Test message')
      })

      expect(result.current.input).toBe('Test message')

      await waitFor(() => {
        expect(result.current.agents.length).toBeGreaterThan(0)
      })
    })

    test('clears input after successful message submission', async () => {
      const { result } = renderHook(() => useChat())

      await waitFor(() => {
        expect(result.current.activeAgentId).toBe(1)
      })

      act(() => {
        result.current.setInput('Test prompt')
      })

      await act(async () => {
        await result.current.onSubmit()
      })

      expect(result.current.input).toBe('')
    })
  })

  describe('Message Submission', () => {
    test('submits message and streams response successfully', async () => {
      const { result } = renderHook(() => useChat())

      await waitFor(() => expect(result.current.activeAgentId).toBe(1))
      
      await waitFor(() => expect(result.current.activeThreadId).toBe('thread-1'))

      act(() => {
        result.current.setInput('Test prompt')
      })

      await act(async () => {
        await result.current.onSubmit()
      })

      const messages = result.current.messagesByConversation['thread-1']
      const userMessage = messages.find(m => m.content === 'Test prompt')
      const assistantMessage = messages.find(m => m.content === 'Hello from assistant')

      expect(userMessage).toBeTruthy()
      expect(userMessage?.role).toBe('user')
      expect(assistantMessage).toBeTruthy()
      expect(assistantMessage?.role).toBe('assistant')
      
      expect(mockStreamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test prompt',
          agentId: 1,
          threadId: 'thread-1',
          onToken: expect.any(Function)
        })
      )
    })

    test('sets loading state correctly during submission', async () => {
      const { result } = renderHook(() => useChat())

      await waitFor(() => {
        expect(result.current.activeAgentId).toBe(1)
      })

      act(() => {
        result.current.setInput('Test prompt')
      })
      
      let submitPromise;
      act(() => {
        submitPromise = result.current.onSubmit()
      })
      
      expect(result.current.isLoading).toBe(true)
      expect(result.current.isStreaming).toBe(true)

      await act(async () => {
          await submitPromise;
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.isStreaming).toBe(false)
    })

    test('does not submit when input is empty', async () => {
      const { result } = renderHook(() => useChat())

      await waitFor(() => {
        expect(result.current.agents).toHaveLength(2)
      })

      await act(async () => {
        await result.current.onSubmit()
      })

      expect(mockStreamChat).not.toHaveBeenCalled()
    })

    test('does not submit when no active agent', async () => {
      mockGetAgents.mockResolvedValueOnce([])
      const { result } = renderHook(() => useChat())

      await waitFor(() => {
        expect(result.current.agents).toEqual([])
      })
      
      act(() => {
        result.current.setInput('Test message')
      })

      await act(async () => {
        await result.current.onSubmit()
      })

      expect(mockStreamChat).not.toHaveBeenCalled()
    })

    test('prevents double submission', async () => {
      const { result } = renderHook(() => useChat())

      await waitFor(() => expect(result.current.activeAgentId).toBe(1))

      act(() => {
        result.current.setInput('Test message')
      })

      act(() => {
        result.current.onSubmit()
      })

      await waitFor(() => expect(result.current.isLoading).toBe(true))

      act(() => {
        result.current.onSubmit()
      })

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(mockStreamChat).toHaveBeenCalledTimes(1)
    })
  })

  describe('Stop Functionality', () => {
    test('provides stop function', async () => {
      const { result } = renderHook(() => useChat())

      expect(typeof result.current.stop).toBe('function')

      await waitFor(() => {
        expect(result.current.agents.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Error Handling', () => {
    test('handles streaming errors gracefully', async () => {
      const error = new Error('Stream failed')
      mockStreamChat.mockRejectedValueOnce(error)
      const { result } = renderHook(() => useChat())

      await waitFor(() => {
        expect(result.current.activeAgentId).toBe(1)
      })
      
      await waitFor(() => expect(result.current.activeThreadId).toBe('thread-1'))

      act(() => {
        result.current.setInput('Test prompt')
      })

      await act(async () => {
        await result.current.onSubmit()
      })

      const messages = result.current.messagesByConversation['thread-1']
      const lastMessage = messages[messages.length - 1]

      expect(lastMessage.role).toBe('assistant')
      expect(lastMessage.content).toBe('Stream failed')
      expect(logger.error).toHaveBeenCalledWith('Stream error', error)
    })
  })

  describe('State Management', () => {
    test('maintains messages by agent correctly', async () => {
      const { result } = renderHook(() => useChat())

      await waitFor(() => {
        expect(result.current.activeAgentId).toBe(1)
      })

      await waitFor(() => {
        expect(result.current.messagesByConversation['thread-1']).toBeDefined()
      })

      expect(Object.keys(result.current.messagesByConversation)).toContain('thread-1')
      expect(result.current.messagesByConversation['thread-1']).toHaveLength(2)
    })
  })
})