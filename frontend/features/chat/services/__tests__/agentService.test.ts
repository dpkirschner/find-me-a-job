import { getAgents, getMessages } from '../agentService'

const originalFetch = global.fetch

describe('agentService', () => {
  const mockAgent = { id: 1, name: 'Test Agent' }
  const mockMessage = { 
    id: 1, 
    agent_id: 1, 
    role: 'user' as const, 
    content: 'Hello test', 
    created_at: '2020-01-01T00:00:00Z' 
  }

  beforeEach(() => {
    // @ts-expect-error override
    global.fetch = jest.fn(async (url: RequestInfo) => {
      if (String(url).endsWith('/agents')) {
        return {
          ok: true,
          json: async () => ({ agents: [mockAgent] }),
        } as any
      }
      return {
        ok: true,
        json: async () => ({ messages: [mockMessage] }),
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
      
      expect(agents).toEqual([mockAgent])
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
})


