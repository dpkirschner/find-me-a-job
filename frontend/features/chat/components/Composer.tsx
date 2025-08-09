import React from 'react'

export interface ComposerProps {
  input: string
  setInput: (v: string) => void
  onSubmit: (e?: React.FormEvent) => void | Promise<void>
  isLoading: boolean
  activeAgentId: number | null
  stop: () => void
}

export function Composer({ input, setInput, onSubmit, isLoading, activeAgentId, stop }: ComposerProps) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
      {isLoading && (
        <div className="flex justify-center mb-2">
          <button onClick={stop} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm">
            Stop Generating
          </button>
        </div>
      )}
      <form onSubmit={onSubmit} className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder={'Type your message... (Shift+Enter for new line)'}
          disabled={isLoading}
          rows={1}
          className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
          aria-label="Send"
        >
          Send
        </button>
      </form>
    </div>
  )
}

export default Composer


