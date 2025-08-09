import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Chat from '../page';
import { TextDecoder, TextEncoder } from 'util';

// Helper function to reduce repetition in tests
function setup() {
  const user = userEvent.setup();
  render(<Chat />);
  return {
    user,
    input: screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)'),
    sendButton: screen.getByRole('button', { name: 'Send' }),
  };
}

// Helper class for mocking the stream
class MockReadableStream {
  private chunks: string[];
  private index: number;

  constructor(chunks: string[]) {
    this.chunks = chunks;
    this.index = 0;
  }

  getReader() {
    return {
      read: async () => {
        if (this.index >= this.chunks.length) {
          return { done: true, value: undefined };
        }
        const chunk = new TextEncoder().encode(this.chunks[this.index++]);
        return { done: false, value: chunk };
      },
    };
  }
}

describe('Chat Component', () => {
  // Mock fetch and other JSDOM APIs before each test
  beforeEach(() => {
    global.fetch = jest.fn();
    global.TextDecoder = TextDecoder;
    global.TextEncoder = TextEncoder;
    Element.prototype.scrollIntoView = jest.fn();
    // Suppress console logs during tests for cleaner output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders initial state correctly', () => {
    setup();
    expect(screen.getByText('Chat Assistant')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  test('enables send button when input has text', async () => {
    const { user, input, sendButton } = setup();
    await user.type(input, 'Hello');
    expect(sendButton).toBeEnabled();
  });

  test('displays user message and clears input on submission', async () => {
    const { user, input, sendButton } = setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: new MockReadableStream(['data: [DONE]\n\n']),
    });

    await user.type(input, 'My test message');
    await user.click(sendButton);

    expect(screen.getByText('My test message')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: JSON.stringify({ message: 'My test message' }),
    }));
  });

  test('handles streaming response correctly', async () => {
    const { user, input, sendButton } = setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: new MockReadableStream(['data: Streaming\n\n', 'data:  response\n\n', 'data: [DONE]\n\n']),
    });

    await user.type(input, 'Test');
    await user.click(sendButton);

    await waitFor(() => {
      // While streaming, content is in a <pre> tag
      expect(screen.getByText('Streaming response')).toBeInTheDocument();
    });
  });

  test('renders markdown with raw HTML correctly after stream', async () => {
    const { user, sendButton } = setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: new MockReadableStream(['data: This is <u>underlined</u> text.\n\n', 'data: [DONE]\n\n']),
    });

    await user.type(screen.getByPlaceholderText(/Type your message/), 'Test HTML');
    await user.click(sendButton);

    // Wait for the streaming to finish
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop Generating' })).not.toBeInTheDocument());

    // After streaming, content is rendered via ReactMarkdown
    const underlinedText = screen.getByText('underlined');
    expect(underlinedText).toBeInTheDocument();
    expect(underlinedText.tagName).toBe('U');
  });

  test('handles API error response correctly', async () => {
    const { user, sendButton } = setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ detail: 'LLM service is unavailable' }),
    });

    await user.type(screen.getByPlaceholderText(/Type your message/), 'Test error');
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('LLM service is unavailable')).toBeInTheDocument();
    });
  });
  
  test('handles network failure correctly', async () => {
    const { user, sendButton } = setup();
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

    await user.type(screen.getByPlaceholderText(/Type your message/), 'Test network failure');
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    });
  });

  test('shows stop generating button during stream and disables input', async () => {
    const { user, input, sendButton } = setup();
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {})); // Unresolved promise

    await user.type(input, 'Hanging request');
    await user.click(sendButton);

    expect(screen.getByRole('button', { name: 'Stop Generating' })).toBeInTheDocument();
    expect(input).toBeDisabled();
  });

  test('stop generating button aborts the fetch request', async () => {
    const { user, sendButton } = setup();
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

    await user.type(screen.getByPlaceholderText(/Type your message/), 'Test abort');
    await user.click(sendButton);

    const stopButton = await screen.findByRole('button', { name: 'Stop Generating' });
    await user.click(stopButton);

    expect(abortSpy).toHaveBeenCalledTimes(1);
  });
});