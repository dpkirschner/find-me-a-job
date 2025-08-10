import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import ChatPage from '../ChatPage'

// Mock useChat hook with different scenarios
const mockUseChat = jest.fn()
jest.mock('../../hooks/useChat', () => ({
  __esModule: true,
  default: () => mockUseChat(),
}))

describe('ChatPage', () => {
  const defaultMockData = {
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
  }

  beforeEach(() => {
    mockUseChat.mockReturnValue(defaultMockData)
    jest.clearAllMocks()
    
    // Mock document.documentElement.classList for theme functionality
    Object.defineProperty(document.documentElement, 'classList', {
      value: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn(() => false),
      },
      writable: true,
    })
  })

  describe('Layout and Structure', () => {
    test('renders essential chat interface elements', () => {
      render(<ChatPage />)
      
      expect(screen.getByRole('button', { name: /my workspace/i })).toBeInTheDocument()
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByRole('feed')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
      expect(screen.getByText('hello')).toBeInTheDocument()
      expect(screen.getByText('hi')).toBeInTheDocument()
    })

    test('displays active agent name across interface', () => {
      render(<ChatPage />)
      
      const agentNameElements = screen.getAllByText('Agent A')
      expect(agentNameElements).toHaveLength(3)
    })

    test('shows sidebar and details panel on desktop', () => {
      render(<ChatPage />)
      
      expect(screen.getAllByText('Agent A')).toHaveLength(3)
      expect(screen.getByText('Agent information')).toBeInTheDocument()
    })
  })

  describe('Empty States', () => {
    test('shows "pick an agent" message when no active agent', () => {
      mockUseChat.mockReturnValue({
        ...defaultMockData,
        activeAgentId: null,
      })
      
      render(<ChatPage />)
      
      expect(screen.getByText('Pick an agent to start')).toBeInTheDocument()
      expect(screen.getByText('Create or select a conversation in the left panel.')).toBeInTheDocument()
    })

    test('shows "no messages" when agent has no messages', () => {
      mockUseChat.mockReturnValue({
        ...defaultMockData,
        messagesByAgent: { 1: [] },
      })
      
      render(<ChatPage />)
      
      expect(screen.getByText('No messages yet')).toBeInTheDocument()
      expect(screen.getByText('Say hello to this agent.')).toBeInTheDocument()
    })
  })

  describe('Loading and Streaming States', () => {
    test('shows loading state in feed when isLoading and isStreaming', () => {
      mockUseChat.mockReturnValue({
        ...defaultMockData,
        isLoading: true,
        isStreaming: true,
      })
      
      render(<ChatPage />)
      
      const feed = screen.getByRole('feed')
      expect(feed).toHaveAttribute('aria-busy', 'true')
    })

    test('does not show loading state when not streaming', () => {
      mockUseChat.mockReturnValue({
        ...defaultMockData,
        isLoading: true,
        isStreaming: false,
      })
      
      render(<ChatPage />)
      
      const feed = screen.getByRole('feed')
      expect(feed).toHaveAttribute('aria-busy', 'false')
    })
  })

  describe('Theme Functionality', () => {
    test('toggles dark mode when theme button clicked', async () => {
      const user = userEvent.setup()
      render(<ChatPage />)
      
      const themeButton = screen.getByRole('button', { name: 'Toggle theme' })
      await user.click(themeButton)
      
      await waitFor(() => {
        expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark')
      })
    })
  })

  describe('Mobile Drawer Navigation', () => {
    test('opens conversations drawer when button clicked', async () => {
      const user = userEvent.setup()
      render(<ChatPage />)
      
      const openLeftButton = screen.getByRole('button', { name: 'Open conversations' })
      await user.click(openLeftButton)
      
      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveTextContent('Conversations')
    })

    test('opens details drawer when button clicked', async () => {
      const user = userEvent.setup()
      render(<ChatPage />)
      
      const openRightButton = screen.getByRole('button', { name: 'Open details' })
      await user.click(openRightButton)
      
      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveTextContent('Details')
    })

    test('allows selecting different agent from conversations drawer', async () => {
      const user = userEvent.setup()
      const mockSetActiveAgentId = jest.fn()
      
      mockUseChat.mockReturnValue({
        ...defaultMockData,
        setActiveAgentId: mockSetActiveAgentId,
      })
      
      render(<ChatPage />)
      
      await user.click(screen.getByRole('button', { name: 'Open conversations' }))
      
      const agentBButton = screen.getByRole('button', { name: 'Agent B' })
      await user.click(agentBButton)
      
      expect(mockSetActiveAgentId).toHaveBeenCalledWith(2)
    })

    test('closes drawer when close button clicked', async () => {
      const user = userEvent.setup()
      render(<ChatPage />)
      
      await user.click(screen.getByRole('button', { name: 'Open conversations' }))
      
      const drawer = screen.getByRole('dialog')
      expect(drawer).toBeInTheDocument()
      
      const closeButton = screen.getByRole('button', { name: 'Close' })
      await user.click(closeButton)
      
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })

  describe('Message Display', () => {
    test('renders all messages for active agent', () => {
      const mockMessages = [
        { role: 'user', content: 'Hello there' },
        { role: 'assistant', content: 'Hi! How can I help?' },
        { role: 'user', content: 'What is React?' },
      ]
      
      mockUseChat.mockReturnValue({
        ...defaultMockData,
        messagesByAgent: { 1: mockMessages },
      })
      
      render(<ChatPage />)
      
      expect(screen.getByText('Hello there')).toBeInTheDocument()
      expect(screen.getByText('Hi! How can I help?')).toBeInTheDocument()
      expect(screen.getByText('What is React?')).toBeInTheDocument()
    })
  })

  describe('Composer Integration', () => {
    test('renders composer with correct state', () => {
      const mockOnSubmit = jest.fn()
      const mockSetInput = jest.fn()
      const mockStop = jest.fn()
      
      mockUseChat.mockReturnValue({
        ...defaultMockData,
        input: 'test message',
        setInput: mockSetInput,
        onSubmit: mockOnSubmit,
        stop: mockStop,
        isLoading: true,
      })
      
      render(<ChatPage />)
      
      const sendButton = screen.getByRole('button', { name: 'Send' })
      expect(sendButton).toBeDisabled()
      
      const textbox = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
      expect(textbox).toHaveValue('test message')
    })
  })

  describe('Accessibility', () => {
    test('provides proper semantic structure and labels', () => {
      render(<ChatPage />)
      
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByRole('feed')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open conversations' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open details' })).toBeInTheDocument()
    })
  })
})


