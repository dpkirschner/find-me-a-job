import { streamChat } from '../chatService'

const originalFetch = global.fetch

function createReadableStreamFromStrings(parts: string[]) {
  const encoder = new TextEncoder()
  const iterator = parts.map((p) => encoder.encode(p))[Symbol.iterator]()
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = iterator.next()
      if (next.done) controller.close()
      else controller.enqueue(next.value)
    },
  })
}

function createMockStreamResponse(streamParts: string[]) {
  const body = createReadableStreamFromStrings(streamParts)
  return {
    ok: true,
    json: async () => ({}),
    body,
  } as any
}

describe('chatService', () => {
  const mockOnToken = jest.fn()
  const basicStreamData = [
    'data: hello\n\n',
    'data: world\n\n',
    'data: [DONE]\n\n',
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    // @ts-expect-error override
    global.fetch = jest.fn(async () => createMockStreamResponse(basicStreamData))
  })

  afterEach(() => {
    global.fetch = originalFetch as any
  })

  describe('streamChat', () => {
    test('processes streaming tokens correctly and filters control tokens', async () => {
      const tokens: string[] = []
      await streamChat({ message: 'hi', onToken: (t) => tokens.push(t) })
      
      expect(tokens).toEqual(['hello', 'world'])
      // Should not include [DONE] control token
      expect(tokens).not.toContain('[DONE]')
    })

    test('sends correct request parameters to chat endpoint', async () => {
      await streamChat({ message: 'test message', onToken: mockOnToken })
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({ message: 'test message' }),
          cache: 'no-store'
        })
      )
    })

    test('handles empty stream gracefully', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(
        createMockStreamResponse(['data: [DONE]\n\n'])
      )

      const tokens: string[] = []
      await streamChat({ message: 'empty', onToken: (t) => tokens.push(t) })
      
      expect(tokens).toEqual([])
    })

    test('processes multiple tokens in sequence', async () => {
      const multiTokenStream = [
        'data: The\n\n',
        'data: quick\n\n',
        'data: brown\n\n',
        'data: fox\n\n',
        'data: [DONE]\n\n',
      ]
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(
        createMockStreamResponse(multiTokenStream)
      )

      const tokens: string[] = []
      await streamChat({ message: 'story', onToken: (t) => tokens.push(t) })
      
      expect(tokens).toEqual(['The', 'quick', 'brown', 'fox'])
    })

    test('calls onToken callback for each valid token', async () => {
      await streamChat({ message: 'test', onToken: mockOnToken })
      
      expect(mockOnToken).toHaveBeenCalledTimes(2)
      expect(mockOnToken).toHaveBeenNthCalledWith(1, 'hello')
      expect(mockOnToken).toHaveBeenNthCalledWith(2, 'world')
    })

    test('handles network errors during streaming', async () => {
      const networkError = new Error('Network connection failed')
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(networkError)

      await expect(
        streamChat({ message: 'test', onToken: mockOnToken })
      ).rejects.toThrow('Network connection failed')
      
      expect(mockOnToken).not.toHaveBeenCalled()
    })

    test('handles malformed server response', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      await expect(
        streamChat({ message: 'test', onToken: mockOnToken })
      ).rejects.toThrow()
    })

    test('handles stream read errors', async () => {
      const corruptedStream = new ReadableStream({
        start(controller) {
          controller.error(new Error('Stream corrupted'))
        }
      })
      
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: corruptedStream
      })

      await expect(
        streamChat({ message: 'test', onToken: mockOnToken })
      ).rejects.toThrow('Stream corrupted')
    })

    test('ignores malformed SSE data lines', async () => {
      const malformedStream = [
        'data: valid_token\n\n',
        'invalid_line_without_data_prefix\n\n',
        'data: another_valid\n\n',
        'data: [DONE]\n\n',
      ]
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(
        createMockStreamResponse(malformedStream)
      )

      const tokens: string[] = []
      await streamChat({ message: 'test', onToken: (t) => tokens.push(t) })
      
      expect(tokens).toEqual(['valid_token', 'another_valid'])
    })

    test('handles empty message input', async () => {
      await streamChat({ message: '', onToken: mockOnToken })
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ message: '' }),
          cache: 'no-store'
        })
      )
    })

    test('filters out [DONE] control token but preserves other tokens', async () => {
      const controlTokenStream = [
        'data: hello\n\n',
        'data: [DONE]\n\n',
      ]
      ;(global.fetch as jest.Mock).mockResolvedValueOnce(
        createMockStreamResponse(controlTokenStream)
      )

      const tokens: string[] = []
      await streamChat({ message: 'test', onToken: (t) => tokens.push(t) })
      
      // Should only include content tokens, [DONE] stops the stream
      expect(tokens).toEqual(['hello'])
    })
  })
})


