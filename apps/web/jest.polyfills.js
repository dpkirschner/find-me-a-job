// Polyfill HTMLFormElement.prototype.requestSubmit for JSDOM
Object.defineProperty(HTMLFormElement.prototype, 'requestSubmit', {
  value: function(submitter) {
    if (submitter) {
      const event = new Event('submit', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'submitter', { value: submitter })
      this.dispatchEvent(event)
    } else {
      this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    }
  },
  writable: true,
  configurable: true
})

// Polyfill Element.prototype.scrollIntoView for JSDOM
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = function() {
    // No-op implementation for testing
  }
}

// Polyfill TextEncoder/TextDecoder for Node.js environment
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util')
  global.TextEncoder = TextEncoder
  global.TextDecoder = TextDecoder
}

// Polyfill ReadableStream for Node.js environment
if (typeof global.ReadableStream === 'undefined') {
  try {
    // Try Node.js 18+ built-in web streams
    const { ReadableStream } = require('node:stream/web')
    global.ReadableStream = ReadableStream
  } catch {
    // Fallback to a simple mock for testing
    global.ReadableStream = class ReadableStream {
      constructor(underlyingSource) {
        this.underlyingSource = underlyingSource
      }
      
      getReader() {
        return {
          read: async () => ({ done: true, value: undefined })
        }
      }
    }
  }
}

// Polyfill crypto.randomUUID for Node.js environment
if (typeof global.crypto === 'undefined') {
  global.crypto = {}
}
if (typeof global.crypto.randomUUID === 'undefined') {
  global.crypto.randomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c == 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }
}