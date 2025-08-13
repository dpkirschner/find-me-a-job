import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { CreateAgentModal } from '../CreateAgentModal'

describe('CreateAgentModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onCreateAgent: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    test('renders modal when open', () => {
      render(<CreateAgentModal {...defaultProps} />)

      expect(screen.getByText('Create New Agent')).toBeInTheDocument()
      expect(screen.getByLabelText('Agent Name')).toBeInTheDocument()
      expect(screen.getByLabelText(/System Prompt/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create Agent' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    test('does not render when closed', () => {
      render(<CreateAgentModal {...defaultProps} isOpen={false} />)

      expect(screen.queryByText('Create New Agent')).not.toBeInTheDocument()
    })

    test('renders system prompt field with optional label', () => {
      render(<CreateAgentModal {...defaultProps} />)

      const systemPromptLabel = screen.getByText(/System Prompt/)
      expect(systemPromptLabel).toBeInTheDocument()
      expect(systemPromptLabel).toHaveTextContent('System Prompt (optional)')
    })

    test('has proper form field attributes', () => {
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const systemPromptInput = screen.getByLabelText(/System Prompt/)

      expect(nameInput).toHaveAttribute('type', 'text')
      expect(nameInput).toHaveAttribute('placeholder', 'Enter agent name')

      expect(systemPromptInput).toHaveAttribute('rows', '4')
      expect(systemPromptInput).toHaveAttribute('placeholder', 'Enter system prompt to guide the agent\'s behavior...')
    })
  })

  describe('User Interactions', () => {
    test('allows typing in agent name field', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      await user.type(nameInput, 'Test Agent')

      expect(nameInput).toHaveValue('Test Agent')
    })

    test('allows typing in system prompt field', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      await user.type(systemPromptInput, 'You are a helpful assistant.')

      expect(systemPromptInput).toHaveValue('You are a helpful assistant.')
    })

    test('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    test('calls onClose when close button (X) is clicked', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const closeButton = screen.getByLabelText('Close modal')
      await user.click(closeButton)

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    test('calls onClose when backdrop is clicked', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      // Click on the backdrop (the dark overlay)
      const backdrop = document.querySelector('.fixed.inset-0.bg-black')
      expect(backdrop).toBeInTheDocument()
      
      if (backdrop) {
        await user.click(backdrop)
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe('Form Submission', () => {
    test('creates agent with name only when system prompt is empty', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const submitButton = screen.getByRole('button', { name: 'Create Agent' })

      await user.type(nameInput, 'Test Agent')
      await user.click(submitButton)

      expect(defaultProps.onCreateAgent).toHaveBeenCalledWith('Test Agent', undefined)
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    test('creates agent with name and system prompt when both provided', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const submitButton = screen.getByRole('button', { name: 'Create Agent' })

      await user.type(nameInput, 'Test Agent')
      await user.type(systemPromptInput, 'You are a helpful assistant.')
      await user.click(submitButton)

      expect(defaultProps.onCreateAgent).toHaveBeenCalledWith('Test Agent', 'You are a helpful assistant.')
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    test('trims whitespace from inputs', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const submitButton = screen.getByRole('button', { name: 'Create Agent' })

      await user.type(nameInput, '  Test Agent  ')
      await user.type(systemPromptInput, '  You are helpful.  ')
      await user.click(submitButton)

      expect(defaultProps.onCreateAgent).toHaveBeenCalledWith('Test Agent', 'You are helpful.')
    })

    test('passes undefined for system prompt when only whitespace', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const submitButton = screen.getByRole('button', { name: 'Create Agent' })

      await user.type(nameInput, 'Test Agent')
      await user.type(systemPromptInput, '   ')
      await user.click(submitButton)

      expect(defaultProps.onCreateAgent).toHaveBeenCalledWith('Test Agent', undefined)
    })

    test('submits form on Enter key in name field', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      await user.type(nameInput, 'Test Agent')
      await user.keyboard('{Enter}')

      expect(defaultProps.onCreateAgent).toHaveBeenCalledWith('Test Agent', undefined)
    })

    test('does not submit when agent name is empty', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const submitButton = screen.getByRole('button', { name: 'Create Agent' })
      
      expect(submitButton).toBeDisabled()
      await user.click(submitButton)

      expect(defaultProps.onCreateAgent).not.toHaveBeenCalled()
    })

    test('does not submit when agent name is only whitespace', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const submitButton = screen.getByRole('button', { name: 'Create Agent' })

      await user.type(nameInput, '   ')
      
      expect(submitButton).toBeDisabled()
      await user.click(submitButton)

      expect(defaultProps.onCreateAgent).not.toHaveBeenCalled()
    })
  })

  describe('Form Reset', () => {
    test('clears form when cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })

      await user.type(nameInput, 'Test Agent')
      await user.type(systemPromptInput, 'Test prompt')
      await user.click(cancelButton)

      expect(defaultProps.onClose).toHaveBeenCalled()
      
      // Fields should be cleared for next time modal opens
      expect(nameInput).toHaveValue('')
      expect(systemPromptInput).toHaveValue('')
    })

    test('clears form after successful submission', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const submitButton = screen.getByRole('button', { name: 'Create Agent' })

      await user.type(nameInput, 'Test Agent')
      await user.type(systemPromptInput, 'Test prompt')
      await user.click(submitButton)

      expect(nameInput).toHaveValue('')
      expect(systemPromptInput).toHaveValue('')
    })
  })

  describe('Button States', () => {
    test('create button is enabled when name has content', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const submitButton = screen.getByRole('button', { name: 'Create Agent' })

      expect(submitButton).toBeDisabled()

      await user.type(nameInput, 'A')
      expect(submitButton).toBeEnabled()

      await user.clear(nameInput)
      expect(submitButton).toBeDisabled()
    })

    test('create button is enabled with name even if system prompt is empty', async () => {
      const user = userEvent.setup()
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const submitButton = screen.getByRole('button', { name: 'Create Agent' })

      await user.type(nameInput, 'Test Agent')
      expect(submitButton).toBeEnabled()
    })
  })

  describe('Accessibility', () => {
    test('has proper focus management', () => {
      render(<CreateAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      expect(nameInput).toHaveFocus()
    })

    test('has proper aria labels', () => {
      render(<CreateAgentModal {...defaultProps} />)

      expect(screen.getByLabelText('Close modal')).toBeInTheDocument()
      expect(screen.getByLabelText('Agent Name')).toBeInTheDocument()
      expect(screen.getByLabelText(/System Prompt/)).toBeInTheDocument()
    })
  })
})