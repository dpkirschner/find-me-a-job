import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Chat from '../page'

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock scrollIntoView which is not available in JSDOM
Element.prototype.scrollIntoView = jest.fn()

// Mock TextDecoder and TextEncoder for streaming tests
import { TextDecoder, TextEncoder } from 'util'
global.TextDecoder = global.TextDecoder || TextDecoder
global.TextEncoder = global.TextEncoder || TextEncoder

// Mock ReadableStream for streaming responses
class MockReadableStream {
  private chunks: string[]
  private index: number

  constructor(chunks: string[]) {
    this.chunks = chunks
    this.index = 0
  }

  getReader() {
    return {
      read: async () => {
        if (this.index >= this.chunks.length) {
          return { done: true, value: undefined }
        }
        const chunk = new TextEncoder().encode(this.chunks[this.index++])
        return { done: false, value: chunk }
      }
    }
  }
}

describe('Chat Component', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    // Reset console methods
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('renders initial state correctly', () => {
    render(<Chat />)
    
    expect(screen.getByText('Chat Assistant')).toBeInTheDocument()
    expect(screen.getByText('Start a conversation by typing a message below.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  test('send button is disabled when input is empty', () => {
    render(<Chat />)
    
    const sendButton = screen.getByRole('button', { name: 'Send' })
    expect(sendButton).toBeDisabled()
  })

  test('send button is enabled when input has text', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    const sendButton = screen.getByRole('button', { name: 'Send' })
    
    await user.type(input, 'Hello')
    
    expect(sendButton).toBeEnabled()
  })

  test('submits message and clears input', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    // Mock successful response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new MockReadableStream([
        'data: Hello',
        'data: World',
        'data: [DONE]'
      ])
    })
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    const sendButton = screen.getByRole('button', { name: 'Send' })
    
    await user.type(input, 'Test message')
    await user.click(sendButton)
    
    expect(input).toHaveValue('')
    expect(mockFetch).toHaveBeenCalledWith('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Test message' }),
      signal: expect.any(AbortSignal)
    })
  })

  test('displays user message immediately after submission', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    // Mock successful response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new MockReadableStream(['data: Response', 'data: [DONE]'])
    })
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    
    await user.type(input, 'Test message')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    
    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  test('shows stop generating button when loading', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    // Mock a hanging promise to keep loading state
    mockFetch.mockImplementation(() => new Promise(() => {}))
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    
    await user.type(input, 'Test message')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    
    expect(screen.getByRole('button', { name: 'Stop Generating' })).toBeInTheDocument()
  })

  test('handles streaming response correctly', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    // Mock streaming response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new MockReadableStream([
        'data: Hello',
        'data:  World',
        'data: !',
        'data: [DONE]'
      ])
    })
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    
    await user.type(input, 'Test message')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    
    await waitFor(() => {
      expect(screen.getByText('Hello World!')).toBeInTheDocument()
    })
  })

  test('handles error response correctly', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    // Mock error response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ detail: 'Server error occurred' })
    })
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    
    await user.type(input, 'Test message')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    
    await waitFor(() => {
      expect(screen.getByText('Server error occurred')).toBeInTheDocument()
    })
  })

  test('handles network error correctly', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    // Mock network error
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    
    await user.type(input, 'Test message')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  test('filters out control tokens', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    // Mock response with control tokens
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new MockReadableStream([
        'data: Hello',
        'data: [DONE]',
        'data: This should not appear',
        'data: [DONE]'
      ])
    })
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    
    await user.type(input, 'Test message')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument()
      expect(screen.queryByText('[DONE]')).not.toBeInTheDocument()
      expect(screen.queryByText('This should not appear')).not.toBeInTheDocument()
    })
  })

  test('handles abort signal correctly', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    // Mock aborted request
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    
    await user.type(input, 'Test message')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    
    await waitFor(() => {
      expect(screen.getByText(/Request stopped/)).toBeInTheDocument()
    })
  })

  test('stop generating button aborts request', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    // Mock a long-running request
    const mockController = {
      abort: jest.fn(),
      signal: new AbortController().signal
    }
    
    jest.spyOn(window, 'AbortController').mockImplementation(() => mockController as AbortController)
    
    mockFetch.mockImplementation(() => new Promise(() => {}))
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    
    await user.type(input, 'Test message')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    
    const stopButton = screen.getByRole('button', { name: 'Stop Generating' })
    await user.click(stopButton)
    
    expect(mockController.abort).toHaveBeenCalled()
  })

  test('Enter key submits form', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new MockReadableStream(['data: Response', 'data: [DONE]'])
    })
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    
    await user.type(input, 'Test message')
    await user.keyboard('{Enter}')
    
    expect(mockFetch).toHaveBeenCalledWith('/chat', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ message: 'Test message' })
    }))
  })

  test('Shift+Enter creates new line without submitting', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)') as HTMLTextAreaElement
    
    await user.type(input, 'First line')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    await user.type(input, 'Second line')
    
    expect(input.value).toBe('First line\nSecond line')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('input is disabled while loading', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    
    // Mock hanging request
    mockFetch.mockImplementation(() => new Promise(() => {}))
    
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    
    await user.type(input, 'Test message')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    
    expect(input).toBeDisabled()
  })
})