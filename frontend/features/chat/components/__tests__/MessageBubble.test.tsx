import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import MessageBubble from '../MessageBubble'

describe('MessageBubble', () => {
  const userMessage = { role: 'user' as const, content: 'Hello, how are you?' }
  const assistantMessage = { role: 'assistant' as const, content: 'I am doing well, thank you!' }

  describe('User Messages', () => {
    test('renders user message content', () => {
      render(<MessageBubble m={userMessage} />)
      
      expect(screen.getByText('Hello, how are you?')).toBeInTheDocument()
    })

    test('displays user messages with blue styling', () => {
      render(<MessageBubble m={userMessage} />)
      
      const messageElement = screen.getByText('Hello, how are you?').closest('div')
      expect(messageElement).toHaveClass('bg-blue-500', 'text-white')
    })

    test('aligns user messages to the right', () => {
      render(<MessageBubble m={userMessage} />)
      
      const container = screen.getByText('Hello, how are you?').closest('div')?.parentElement
      expect(container).toHaveClass('justify-end')
    })
  })

  describe('Assistant Messages', () => {
    test('renders assistant message content', () => {
      render(<MessageBubble m={assistantMessage} />)
      
      expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument()
    })

    test('displays assistant messages with default styling', () => {
      render(<MessageBubble m={assistantMessage} />)
      
      const messageElement = screen.getByText('I am doing well, thank you!').closest('div')
      expect(messageElement).toHaveClass('bg-white', 'dark:bg-gray-800')
    })

    test('aligns assistant messages to the left', () => {
      render(<MessageBubble m={assistantMessage} />)
      
      const container = screen.getByText('I am doing well, thank you!').closest('div')?.parentElement
      expect(container).toHaveClass('justify-start')
    })

    test('renders markdown content for completed assistant messages', () => {
      const markdownMessage = { role: 'assistant' as const, content: '**Bold text** and `code`' }
      render(<MessageBubble m={markdownMessage} />)
      
      // MarkdownRenderer should process the markdown
      expect(screen.getByText('code')).toBeInTheDocument()
    })
  })

  describe('Streaming Messages', () => {
    test('renders streaming assistant message as preformatted text', () => {
      render(<MessageBubble m={assistantMessage} isLastStreaming={true} />)
      
      const streamingElement = screen.getByText('I am doing well, thank you!')
      expect(streamingElement.tagName.toLowerCase()).toBe('pre')
      expect(streamingElement).toHaveClass('whitespace-pre-wrap', 'font-sans')
    })

    test('does not process markdown during streaming', () => {
      const markdownMessage = { role: 'assistant' as const, content: '**Bold text**' }
      render(<MessageBubble m={markdownMessage} isLastStreaming={true} />)
      
      // Should render raw markdown, not processed
      expect(screen.getByText('**Bold text**')).toBeInTheDocument()
    })
  })

  describe('Message Layout', () => {
    test('applies consistent message bubble styling', () => {
      render(<MessageBubble m={userMessage} />)
      
      const messageElement = screen.getByText('Hello, how are you?').closest('div')
      expect(messageElement).toHaveClass('max-w-[85%]', 'px-4', 'py-2', 'rounded-lg', 'border')
    })

    test('handles long messages with proper text wrapping', () => {
      const longMessage = { 
        role: 'user' as const, 
        content: 'This is a very long message that should wrap properly and not overflow the container boundaries.' 
      }
      render(<MessageBubble m={longMessage} />)
      
      const messageElement = screen.getByText(/This is a very long message/).closest('div')
      expect(messageElement).toHaveClass('break-words', 'whitespace-pre-wrap')
    })
  })

  describe('Content Variations', () => {
    test('handles empty message content', () => {
      const emptyMessage = { role: 'user' as const, content: '' }
      const { container } = render(<MessageBubble m={emptyMessage} />)
      
      // Should render without errors
      const messageContainer = container.querySelector('.max-w-\\[85\\%\\]')
      expect(messageContainer).toBeInTheDocument()
    })

    test('preserves whitespace and line breaks', () => {
      const multilineMessage = { 
        role: 'assistant' as const, 
        content: 'Line 1\nLine 2\n\nLine 4' 
      }
      render(<MessageBubble m={multilineMessage} />)
      
      const messageElement = screen.getByText(/Line 1/).closest('div')
      expect(messageElement).toHaveClass('whitespace-pre-wrap')
    })
  })
})


