import React from 'react'
import { render, screen, fireEvent, createEvent } from '@testing-library/react'
import Composer from '../Composer'

describe('Composer', () => {
  const baseProps = {
    input: '',
    setInput: jest.fn(),
    onSubmit: jest.fn(),
    isLoading: false,
    activeAgentId: 1 as number | null,
    stop: jest.fn(),
  }

  test('submits on button click', () => {
    const { container } = render(<Composer {...baseProps} input={'hi'} />)
    const form = container.querySelector('form')!
    fireEvent.submit(form)
    expect(baseProps.onSubmit).toHaveBeenCalled()
  })

  test('submits on Enter without Shift and prevents default', () => {
    render(<Composer {...baseProps} input={'hello'} />)
    const textarea = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
    
    // Create event using testing library's createEvent
    const keyDownEvent = createEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    const preventDefaultSpy = jest.spyOn(keyDownEvent, 'preventDefault')
    
    fireEvent(textarea, keyDownEvent)
    
    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(baseProps.onSubmit).toHaveBeenCalled()
  })

  test('shows stop button when loading and triggers stop', () => {
    render(<Composer {...baseProps} isLoading={true} />)
    fireEvent.click(screen.getByText('Stop Generating'))
    expect(baseProps.stop).toHaveBeenCalled()
  })
})


