import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import Composer from '../Composer'

describe('Composer', () => {
  const defaultProps = {
    input: '',
    setInput: jest.fn(),
    onSubmit: jest.fn(),
    isLoading: false,
    activeAgentId: 1 as number | null,
    stop: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    test('renders message input and send button', () => {
      render(<Composer {...defaultProps} />)
      
      expect(screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    })

    test('displays current input value in textarea', () => {
      render(<Composer {...defaultProps} input="test message" />)
      
      const textarea = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
      expect(textarea).toHaveValue('test message')
    })

    test('shows stop button when generating response', () => {
      render(<Composer {...defaultProps} isLoading={true} />)
      
      expect(screen.getByRole('button', { name: 'Stop Generating' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })

    test('disables send button when input is empty', () => {
      render(<Composer {...defaultProps} input="" />)
      
      const sendButton = screen.getByRole('button', { name: 'Send' })
      expect(sendButton).toBeDisabled()
    })

    test('enables send button when input has content', () => {
      render(<Composer {...defaultProps} input="hello" />)
      
      const sendButton = screen.getByRole('button', { name: 'Send' })
      expect(sendButton).toBeEnabled()
    })

    test('disables textarea when loading', () => {
      render(<Composer {...defaultProps} isLoading={true} input="test" />)
      
      const textarea = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
      expect(textarea).toBeDisabled()
    })
  })

  describe('User Interactions', () => {
    test('updates input when user types', async () => {
      const user = userEvent.setup()
      render(<Composer {...defaultProps} />)
      
      const textarea = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
      await user.type(textarea, 'Hello')
      
      expect(defaultProps.setInput).toHaveBeenCalled()
    })

    test('submits message when send button clicked', async () => {
      const mockOnSubmit = jest.fn((e) => e?.preventDefault?.())
      const user = userEvent.setup()
      render(<Composer {...defaultProps} input="test message" onSubmit={mockOnSubmit} />)
      
      const sendButton = screen.getByRole('button', { name: 'Send' })
      await user.click(sendButton)
      
      expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    })

    test('submits message on Enter key press', async () => {
      const user = userEvent.setup()
      render(<Composer {...defaultProps} input="test message" />)
      
      const textarea = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
      await user.click(textarea)
      await user.keyboard('{Enter}')
      
      expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1)
    })

    test('creates new line on Shift+Enter without submitting', async () => {
      const user = userEvent.setup()
      render(<Composer {...defaultProps} input="test message" />)
      
      const textarea = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
      await user.click(textarea)
      await user.keyboard('{Shift>}{Enter}{/Shift}')
      
      expect(defaultProps.onSubmit).not.toHaveBeenCalled()
    })

    test('stops generation when stop button clicked', async () => {
      const user = userEvent.setup()
      render(<Composer {...defaultProps} isLoading={true} />)
      
      const stopButton = screen.getByRole('button', { name: 'Stop Generating' })
      await user.click(stopButton)
      
      expect(defaultProps.stop).toHaveBeenCalledTimes(1)
    })
  })

  describe('Accessibility', () => {
    test('textarea has proper attributes for usability', () => {
      render(<Composer {...defaultProps} />)
      
      const textarea = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')
      expect(textarea).toHaveAttribute('rows', '1')
      expect(textarea).toHaveAttribute('placeholder', 'Type your message... (Shift+Enter for new line)')
    })

    test('send button has accessible label', () => {
      render(<Composer {...defaultProps} />)
      
      const sendButton = screen.getByRole('button', { name: 'Send' })
      expect(sendButton).toHaveAttribute('aria-label', 'Send')
    })

    test('stop button has accessible label', () => {
      render(<Composer {...defaultProps} isLoading={true} />)
      
      const stopButton = screen.getByRole('button', { name: 'Stop Generating' })
      expect(stopButton).toBeInTheDocument()
    })
  })
})


