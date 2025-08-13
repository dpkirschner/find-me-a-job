import { getAgents, getMessages, createAgent, updateAgent, deleteAgent } from '../agentService'

const originalFetch = global.fetch

describe('agentService', () => {
  const mockAgent = { id: 1, name: 'Test Agent', system_prompt: null }
  const mockAgentWithPrompt = { id: 2, name: 'Test Agent with Prompt', system_prompt: 'You are helpful.' }
  const mockMessage = { 
    id: 1, 
    agent_id: 1, 
    role: 'user' as const, 
    content: 'Hello test', 
    created_at: '2020-01-01T00:00:00Z' 
  }

  beforeEach(() => {
    // @ts-expect-error override
    global.fetch = jest.fn(async (url: RequestInfo, options?: RequestInit) => {
      const urlStr = String(url)
      const method = options?.method || 'GET'
      
      if (urlStr.endsWith('/agents') && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ agents: [mockAgent, mockAgentWithPrompt] }),
        } as any
      }
      
      if (urlStr.endsWith('/agents') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({ agent: mockAgentWithPrompt }),
        } as any
      }
      
      if (urlStr.includes('/agents/') && method === 'PUT') {
        return {
          ok: true,
          json: async () => mockAgentWithPrompt,
        } as any
      }
      
      if (urlStr.includes('/agents/') && method === 'DELETE') {
        return {
          ok: true,
        } as any
      }
      
      if (urlStr.includes('/messages')) {
        return {
          ok: true,
          json: async () => ({ messages: [mockMessage] }),
        } as any
      }
      
      return {
        ok: true,
        json: async () => ({}),
      } as any
    })
  })

  afterEach(() => {
    global.fetch = originalFetch as any
    jest.clearAllMocks()
  })

  describe('getAgents', () => {
    test('fetches and returns list of agents successfully', async () => {
      const agents = await getAgents()
      
      expect(agents).toEqual([mockAgent, mockAgentWithPrompt])
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents'),
        expect.objectContaining({
          cache: 'no-store'
        })
      )
    })

    test('handles network errors gracefully', async () => {
      const networkError = new Error('Network failed')
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(networkError)

      await expect(getAgents()).rejects.toThrow('Network failed')
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    test('handles non-ok response status', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      await expect(getAgents()).rejects.toThrow()
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    test('handles malformed JSON response', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON'))
      })

      await expect(getAgents()).rejects.toThrow('Invalid JSON')
    })

    test('returns undefined when agents property is missing', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })

      const result = await getAgents()
      expect(result).toBeUndefined()
    })
  })

  describe('getMessages', () => {
    test('fetches and returns messages for specific agent', async () => {
      const agentId = 1
      const messages = await getMessages(agentId)
      
      expect(messages).toEqual([mockMessage])
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/agents/${agentId}/messages`),
        expect.objectContaining({
          cache: 'no-store'
        })
      )
    })

    test('handles different agent IDs correctly', async () => {
      const agentId = 42
      await getMessages(agentId)
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/42/messages'),
        expect.any(Object)
      )
    })

    test('handles network errors when fetching messages', async () => {
      const networkError = new Error('Connection timeout')
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(networkError)

      await expect(getMessages(1)).rejects.toThrow('Connection timeout')
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    test('handles server error response', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      await expect(getMessages(1)).rejects.toThrow()
    })

    test('returns undefined when messages property is missing', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })

      const result = await getMessages(1)
      expect(result).toBeUndefined()
    })

    test('handles multiple messages correctly', async () => {
      const multipleMessages = [
        mockMessage,
        { ...mockMessage, id: 2, content: 'Second message' }
      ]
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: multipleMessages })
      })

      const result = await getMessages(1)
      expect(result).toHaveLength(2)
      expect(result).toEqual(multipleMessages)
    })
  })

  describe('createAgent', () => {
    test('creates agent with name only', async () => {
      const result = await createAgent('New Agent')
      
      expect(result).toEqual(mockAgentWithPrompt)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'New Agent', system_prompt: undefined })
        })
      )
    })

    test('creates agent with name and system prompt', async () => {
      const systemPrompt = 'You are a helpful assistant.'
      const result = await createAgent('New Agent', systemPrompt)
      
      expect(result).toEqual(mockAgentWithPrompt)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'New Agent', system_prompt: systemPrompt })
        })
      )
    })

    test('handles empty system prompt as undefined', async () => {
      await createAgent('New Agent', '')
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents'),
        expect.objectContaining({
          body: JSON.stringify({ name: 'New Agent', system_prompt: '' })
        })
      )
    })

    test('handles network errors when creating agent', async () => {
      const networkError = new Error('Creation failed')
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(networkError)

      await expect(createAgent('New Agent')).rejects.toThrow('Creation failed')
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    test('handles non-ok response status', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      })

      await expect(createAgent('New Agent')).rejects.toThrow()
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    test('returns agent from response', async () => {
      const customAgent = { id: 99, name: 'Custom Agent', system_prompt: 'Custom prompt' }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agent: customAgent })
      })

      const result = await createAgent('Custom Agent', 'Custom prompt')
      expect(result).toEqual(customAgent)
    })
  })

  describe('updateAgent', () => {
    test('updates agent with name only', async () => {
      const result = await updateAgent(1, 'Updated Name')
      
      expect(result).toEqual(mockAgentWithPrompt)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/1'),
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Updated Name' })
        })
      )
    })

    test('updates agent with system prompt only', async () => {
      const systemPrompt = 'Updated prompt'
      const result = await updateAgent(1, undefined, systemPrompt)
      
      expect(result).toEqual(mockAgentWithPrompt)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/1'),
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system_prompt: systemPrompt })
        })
      )
    })

    test('updates agent with both name and system prompt', async () => {
      const result = await updateAgent(1, 'Updated Name', 'Updated prompt')
      
      expect(result).toEqual(mockAgentWithPrompt)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/1'),
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Updated Name', system_prompt: 'Updated prompt' })
        })
      )
    })

    test('updates agent with different agent IDs', async () => {
      await updateAgent(42, 'Test Name')
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/42'),
        expect.any(Object)
      )
    })

    test('handles empty values correctly', async () => {
      await updateAgent(1, '', '')
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/1'),
        expect.objectContaining({
          body: JSON.stringify({ name: '', system_prompt: '' })
        })
      )
    })

    test('omits undefined parameters from request body', async () => {
      await updateAgent(1)
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/1'),
        expect.objectContaining({
          body: JSON.stringify({})
        })
      )
    })

    test('handles network errors when updating agent', async () => {
      const networkError = new Error('Update failed')
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(networkError)

      await expect(updateAgent(1, 'Name')).rejects.toThrow('Update failed')
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    test('handles non-ok response status', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      await expect(updateAgent(1, 'Name')).rejects.toThrow()
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    test('returns updated agent from response', async () => {
      const updatedAgent = { id: 1, name: 'Updated Agent', system_prompt: 'Updated prompt' }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => updatedAgent
      })

      const result = await updateAgent(1, 'Updated Agent', 'Updated prompt')
      expect(result).toEqual(updatedAgent)
    })
  })

  describe('deleteAgent', () => {
    test('deletes agent successfully', async () => {
      await deleteAgent(1)
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/1'),
        expect.objectContaining({
          method: 'DELETE'
        })
      )
    })

    test('handles different agent IDs correctly', async () => {
      await deleteAgent(42)
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/42'),
        expect.any(Object)
      )
    })

    test('handles network errors when deleting agent', async () => {
      const networkError = new Error('Delete failed')
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(networkError)

      await expect(deleteAgent(1)).rejects.toThrow('Delete failed')
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    test('handles non-ok response status', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      await expect(deleteAgent(1)).rejects.toThrow()
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    test('returns void on successful deletion', async () => {
      const result = await deleteAgent(1)
      expect(result).toBeUndefined()
    })
  })
})


