import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { EditAgentModal } from '../EditAgentModal'
import type { Agent } from '../../types'

describe('EditAgentModal', () => {
  const mockAgent: Agent = {
    id: 1,
    name: 'Test Agent',
    system_prompt: 'You are a helpful assistant.'
  }

  const mockAgentNoPrompt: Agent = {
    id: 2,
    name: 'Simple Agent',
    system_prompt: null
  }

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    agent: mockAgent,
    onUpdateAgent: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    test('renders modal when open with agent data', () => {
      render(<EditAgentModal {...defaultProps} />)

      expect(screen.getByText('Edit Agent')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Test Agent')).toBeInTheDocument()
      expect(screen.getByDisplayValue('You are a helpful assistant.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Update Agent' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    test('renders with empty system prompt when agent has null system_prompt', () => {
      render(<EditAgentModal {...defaultProps} agent={mockAgentNoPrompt} />)

      expect(screen.getByDisplayValue('Simple Agent')).toBeInTheDocument()
      
      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      expect(systemPromptInput).toHaveValue('')
    })

    test('does not render when closed', () => {
      render(<EditAgentModal {...defaultProps} isOpen={false} />)

      expect(screen.queryByText('Edit Agent')).not.toBeInTheDocument()
    })

    test('does not render when agent is null', () => {
      render(<EditAgentModal {...defaultProps} agent={null} />)

      expect(screen.queryByText('Edit Agent')).not.toBeInTheDocument()
    })

    test('renders system prompt field with optional label', () => {
      render(<EditAgentModal {...defaultProps} />)

      const systemPromptLabel = screen.getByText(/System Prompt/)
      expect(systemPromptLabel).toBeInTheDocument()
      expect(systemPromptLabel).toHaveTextContent('System Prompt (optional)')
    })

    test('has proper form field attributes', () => {
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const systemPromptInput = screen.getByLabelText(/System Prompt/)

      expect(nameInput).toHaveAttribute('type', 'text')
      expect(nameInput).toHaveAttribute('placeholder', 'Enter agent name')

      expect(systemPromptInput).toHaveAttribute('rows', '4')
      expect(systemPromptInput).toHaveAttribute('placeholder', 'Enter system prompt to guide the agent\'s behavior...')
    })
  })

  describe('Form Initialization', () => {
    test('initializes form with agent data when modal opens', () => {
      const { rerender } = render(<EditAgentModal {...defaultProps} isOpen={false} />)
      
      // Modal should not be visible initially
      expect(screen.queryByText('Edit Agent')).not.toBeInTheDocument()
      
      // Open modal
      rerender(<EditAgentModal {...defaultProps} isOpen={true} />)
      
      expect(screen.getByDisplayValue('Test Agent')).toBeInTheDocument()
      expect(screen.getByDisplayValue('You are a helpful assistant.')).toBeInTheDocument()
    })

    test('updates form data when agent prop changes', () => {
      const { rerender } = render(<EditAgentModal {...defaultProps} />)

      expect(screen.getByDisplayValue('Test Agent')).toBeInTheDocument()

      // Change to different agent
      rerender(<EditAgentModal {...defaultProps} agent={mockAgentNoPrompt} />)

      expect(screen.getByDisplayValue('Simple Agent')).toBeInTheDocument()
      expect(screen.getByLabelText(/System Prompt/)).toHaveValue('')
    })
  })

  describe('User Interactions', () => {
    test('allows editing agent name', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Agent Name')

      expect(nameInput).toHaveValue('Updated Agent Name')
    })

    test('allows editing system prompt', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      await user.clear(systemPromptInput)
      await user.type(systemPromptInput, 'Updated system prompt.')

      expect(systemPromptInput).toHaveValue('Updated system prompt.')
    })

    test('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    test('calls onClose when close button (X) is clicked', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const closeButton = screen.getByLabelText('Close modal')
      await user.click(closeButton)

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    test('calls onClose when backdrop is clicked', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const backdrop = document.querySelector('.fixed.inset-0.bg-black')
      expect(backdrop).toBeInTheDocument()
      
      if (backdrop) {
        await user.click(backdrop)
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe('Form Submission', () => {
    test('updates agent with modified name only', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const submitButton = screen.getByRole('button', { name: 'Update Agent' })

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')
      await user.click(submitButton)

      expect(defaultProps.onUpdateAgent).toHaveBeenCalledWith(1, 'Updated Name', 'You are a helpful assistant.')
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    test('updates agent with modified system prompt only', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const submitButton = screen.getByRole('button', { name: 'Update Agent' })

      await user.clear(systemPromptInput)
      await user.type(systemPromptInput, 'Updated prompt')
      await user.click(submitButton)

      expect(defaultProps.onUpdateAgent).toHaveBeenCalledWith(1, 'Test Agent', 'Updated prompt')
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    test('updates agent with both name and system prompt modified', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const submitButton = screen.getByRole('button', { name: 'Update Agent' })

      await user.clear(nameInput)
      await user.type(nameInput, 'New Name')
      await user.clear(systemPromptInput)
      await user.type(systemPromptInput, 'New prompt')
      await user.click(submitButton)

      expect(defaultProps.onUpdateAgent).toHaveBeenCalledWith(1, 'New Name', 'New prompt')
    })

    test('trims whitespace from inputs', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const submitButton = screen.getByRole('button', { name: 'Update Agent' })

      await user.clear(nameInput)
      await user.type(nameInput, '  Trimmed Name  ')
      await user.clear(systemPromptInput)
      await user.type(systemPromptInput, '  Trimmed prompt  ')
      await user.click(submitButton)

      expect(defaultProps.onUpdateAgent).toHaveBeenCalledWith(1, 'Trimmed Name', 'Trimmed prompt')
    })

    test('passes undefined for system prompt when cleared/empty', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const submitButton = screen.getByRole('button', { name: 'Update Agent' })

      await user.clear(systemPromptInput)
      await user.click(submitButton)

      expect(defaultProps.onUpdateAgent).toHaveBeenCalledWith(1, 'Test Agent', undefined)
    })

    test('passes undefined for system prompt when only whitespace', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const submitButton = screen.getByRole('button', { name: 'Update Agent' })

      await user.clear(systemPromptInput)
      await user.type(systemPromptInput, '   ')
      await user.click(submitButton)

      expect(defaultProps.onUpdateAgent).toHaveBeenCalledWith(1, 'Test Agent', undefined)
    })

    test('submits form on Enter key in name field', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      await user.clear(nameInput)
      await user.type(nameInput, 'New Name')
      await user.keyboard('{Enter}')

      expect(defaultProps.onUpdateAgent).toHaveBeenCalledWith(1, 'New Name', 'You are a helpful assistant.')
    })

    test('does not submit when agent name is empty', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const submitButton = screen.getByRole('button', { name: 'Update Agent' })

      await user.clear(nameInput)
      
      expect(submitButton).toBeDisabled()
      await user.click(submitButton)

      expect(defaultProps.onUpdateAgent).not.toHaveBeenCalled()
    })

    test('does not submit when agent name is only whitespace', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const submitButton = screen.getByRole('button', { name: 'Update Agent' })

      await user.clear(nameInput)
      await user.type(nameInput, '   ')
      
      expect(submitButton).toBeDisabled()
      await user.click(submitButton)

      expect(defaultProps.onUpdateAgent).not.toHaveBeenCalled()
    })
  })

  describe('Form Reset', () => {
    test('resets form to original values when cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })

      // Modify values
      await user.clear(nameInput)
      await user.type(nameInput, 'Modified Name')
      await user.clear(systemPromptInput)
      await user.type(systemPromptInput, 'Modified prompt')

      // Cancel should reset
      await user.click(cancelButton)

      expect(defaultProps.onClose).toHaveBeenCalled()
      
      // Values should be reset to original
      expect(nameInput).toHaveValue('Test Agent')
      expect(systemPromptInput).toHaveValue('You are a helpful assistant.')
    })

    test('resets form to original values when close button is clicked', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const closeButton = screen.getByLabelText('Close modal')

      // Modify values
      await user.clear(nameInput)
      await user.type(nameInput, 'Modified Name')
      await user.clear(systemPromptInput)
      await user.type(systemPromptInput, 'Modified prompt')

      // Close should reset
      await user.click(closeButton)

      expect(nameInput).toHaveValue('Test Agent')
      expect(systemPromptInput).toHaveValue('You are a helpful assistant.')
    })
  })

  describe('Button States', () => {
    test('update button is enabled when name has content', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      const submitButton = screen.getByRole('button', { name: 'Update Agent' })

      expect(submitButton).toBeEnabled()

      await user.clear(nameInput)
      expect(submitButton).toBeDisabled()

      await user.type(nameInput, 'A')
      expect(submitButton).toBeEnabled()
    })

    test('update button is enabled with name even if system prompt is empty', async () => {
      const user = userEvent.setup()
      render(<EditAgentModal {...defaultProps} />)

      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      const submitButton = screen.getByRole('button', { name: 'Update Agent' })

      await user.clear(systemPromptInput)
      expect(submitButton).toBeEnabled()
    })
  })

  describe('Accessibility', () => {
    test('has proper focus management', () => {
      render(<EditAgentModal {...defaultProps} />)

      const nameInput = screen.getByLabelText('Agent Name')
      expect(nameInput).toHaveFocus()
    })

    test('has proper aria labels', () => {
      render(<EditAgentModal {...defaultProps} />)

      expect(screen.getByLabelText('Close modal')).toBeInTheDocument()
      expect(screen.getByLabelText('Agent Name')).toBeInTheDocument()
      expect(screen.getByLabelText(/System Prompt/)).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    test('handles agent with very long system prompt', () => {
      const longPrompt = 'A'.repeat(1000)
      const agentWithLongPrompt = { ...mockAgent, system_prompt: longPrompt }
      
      render(<EditAgentModal {...defaultProps} agent={agentWithLongPrompt} />)

      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      expect(systemPromptInput).toHaveValue(longPrompt)
    })

    test('handles agent with empty string system prompt', () => {
      const agentWithEmptyPrompt = { ...mockAgent, system_prompt: '' }
      
      render(<EditAgentModal {...defaultProps} agent={agentWithEmptyPrompt} />)

      const systemPromptInput = screen.getByLabelText(/System Prompt/)
      expect(systemPromptInput).toHaveValue('')
    })
  })
})