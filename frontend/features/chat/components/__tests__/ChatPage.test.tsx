import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ChatPage from '../ChatPage'

jest.mock('../../hooks/useChat', () => ({
  __esModule: true,
  default: () => ({
    agents: [
      { id: 1, name: 'Agent A' },
      { id: 2, name: 'Agent B' },
    ],
    activeAgentId: 1,
    setActiveAgentId: jest.fn(),
    messagesByAgent: {
      1: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    },
    isLoading: false,
    isStreaming: false,
    input: 'test input',
    setInput: jest.fn(),
    onSubmit: jest.fn(),
    stop: jest.fn(),
  }),
}))

describe('ChatPage', () => {
  test('renders header, messages and composer', async () => {
    await act(async () => {
      render(<ChatPage />)
    })
    expect(screen.getByText('My Workspace')).toBeInTheDocument()
    expect(screen.getAllByText('Agent A')).toHaveLength(3) // Appears in sidebar, header, and details panel
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })
})


