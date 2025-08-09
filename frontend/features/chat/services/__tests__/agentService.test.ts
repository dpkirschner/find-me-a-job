import { getAgents, getMessages } from '../agentService'

const originalFetch = global.fetch

describe('agentService', () => {
  beforeEach(() => {
    // @ts-expect-error override
    global.fetch = jest.fn(async (url: RequestInfo) => {
      if (String(url).endsWith('/agents')) {
        return {
          ok: true,
          json: async () => ({ agents: [{ id: 1, name: 'A' }] }),
        } as any
      }
      return {
        ok: true,
        json: async () => ({ messages: [{ id: 1, agent_id: 1, role: 'user', content: 'hi', created_at: 'x' }] }),
      } as any
    })
  })
  afterEach(() => {
    global.fetch = originalFetch as any
  })

  test('getAgents returns list', async () => {
    const agents = await getAgents()
    expect(agents).toEqual([{ id: 1, name: 'A' }])
  })

  test('getMessages returns list', async () => {
    const msgs = await getMessages(1)
    expect(msgs.length).toBe(1)
  })
})


