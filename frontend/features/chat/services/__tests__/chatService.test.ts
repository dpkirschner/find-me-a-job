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

describe('chatService', () => {
  beforeEach(() => {
    // @ts-expect-error override
    global.fetch = jest.fn(async () => {
      const body = createReadableStreamFromStrings([
        'data: hello\n\n',
        'data: world\n\n',
        'data: [DONE]\n\n',
      ])
      return {
        ok: true,
        json: async () => ({}),
        body,
      } as any
    })
  })
  afterEach(() => {
    global.fetch = originalFetch as any
  })

  test('streamChat yields tokens', async () => {
    const tokens: string[] = []
    await streamChat({ message: 'hi', onToken: (t) => tokens.push(t) })
    expect(tokens).toEqual(['hello', 'world'])
  })
})


