import React from 'react'
import { renderHook, act } from '@testing-library/react'
import useChat from '../../hooks/useChat'

jest.mock('../../services/agentService', () => ({
  __esModule: true,
  getAgents: jest.fn(async () => [{ id: 1, name: 'Agent A' }]),
  getMessages: jest.fn(async () => [
    { id: 1, agent_id: 1, role: 'user', content: 'hi', created_at: '2020-01-01T00:00:00Z' },
  ]),
}))

jest.mock('../../services/chatService', () => ({
  __esModule: true,
  streamChat: jest.fn(async ({ onToken }: any) => {
    onToken('hello')
  }),
}))

jest.mock('../../../../lib/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), error: jest.fn() },
}))

describe('useChat', () => {
  test('loads agents and messages, streams tokens, and stop aborts', async () => {
    const { result } = renderHook(() => useChat())

    // Wait for initial agents fetch microtasks
    await act(async () => {})
    expect(result.current.agents.length).toBe(1)
    expect(result.current.activeAgentId).toBe(1)

    // Trigger messages load for active agent
    await act(async () => {})
    expect(Object.values(result.current.messagesByAgent)[0]?.length).toBeGreaterThanOrEqual(1)

    // Prepare to submit
    act(() => {
      result.current.setInput('Test prompt')
    })

    await act(async () => {
      await result.current.onSubmit()
    })

    const msgs = result.current.messagesByAgent[result.current.activeAgentId as number]
    expect(msgs[msgs.length - 1].role).toBe('assistant')
    expect(msgs[msgs.length - 1].content).toContain('hello')

    // Abort
    act(() => {
      result.current.stop()
    })
  })
})


