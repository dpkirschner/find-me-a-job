import React from 'react'
import type { UIMessage } from '../types'
import MarkdownRenderer from './MarkdownRenderer'
import classNames from '../../../lib/classNames'

export function MessageBubble({ m, isLastStreaming }: { m: UIMessage; isLastStreaming?: boolean }) {
  const mine = m.role === 'user'
  const common =
    'max-w-[85%] lg:max-w-[60ch] px-4 py-2 rounded-lg border text-sm leading-relaxed break-words'
  const cls = mine
    ? 'bg-blue-500 text-white border-blue-500'
    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700'
  
  // For user messages or streaming, preserve whitespace. For completed assistant messages, let markdown handle it.
  const needsWhitespacePreserve = mine || isLastStreaming
  
  return (
    <div className={classNames('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={classNames(common, cls, needsWhitespacePreserve && 'whitespace-pre-wrap')}>
        {isLastStreaming ? (
          <pre className="whitespace-pre-wrap font-sans">{m.content.trim()}</pre>
        ) : (
          <MarkdownRenderer>{m.content}</MarkdownRenderer>
        )}
      </div>
    </div>
  )
}

export default MessageBubble


