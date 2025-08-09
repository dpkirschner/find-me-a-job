import React from 'react'
import { render, screen } from '@testing-library/react'
import MessageBubble from '../MessageBubble'

describe('MessageBubble', () => {
  test('renders user message', () => {
    render(<MessageBubble m={{ role: 'user', content: 'hello' }} />)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  test('renders assistant streaming as pre', () => {
    render(<MessageBubble m={{ role: 'assistant', content: 'stream' }} isLastStreaming />)
    expect(screen.getByText('stream').tagName.toLowerCase()).toBe('pre')
  })
})


