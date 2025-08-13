import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import DetailsPanel from '../DetailsPanel'

jest.mock('../../../../lib/time', () => ({
  __esModule: true,
  default: jest.fn((iso?: string) => `ago(${iso})`),
  timeAgo: jest.fn((iso?: string) => `ago(${iso})`),
}))

describe('DetailsPanel', () => {
  const defaultProps = {
    agents: [
      { id: 1, name: 'Agent A', system_prompt: 'You are a helpful assistant.' },
      { id: 2, name: 'Agent B', system_prompt: null },
    ],
    activeAgentId: 1 as number | null,
    activeThreadId: 'thread-1' as string | null,
    messagesForActive: [
      { role: 'user' as const, content: 'hi', created_at: '2020-01-01T00:00:00Z' },
      { role: 'assistant' as const, content: 'hello', created_at: '2020-01-01T00:01:00Z' },
    ],
    onUpdateAgent: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    test('displays details panel with agent information', () => {
      render(<DetailsPanel {...defaultProps} />)

      expect(screen.getByRole('complementary', { name: 'Details' })).toBeInTheDocument()
      expect(screen.getByText('Details')).toBeInTheDocument()
      expect(screen.getByText('Agent information')).toBeInTheDocument()
    })

    test('shows active agent name and message count', () => {
      render(<DetailsPanel {...defaultProps} />)

      expect(screen.getByText('Agent A')).toBeInTheDocument()
      expect(screen.getByText('thread-1')).toBeInTheDocument()
      expect(screen.getByText((content, element) => {
        return element?.textContent === 'Messages: 2'
      })).toBeInTheDocument()
    })

    test('displays last activity time when messages exist', () => {
      render(<DetailsPanel {...defaultProps} />)

      expect(screen.getByText(/Last activity:/)).toBeInTheDocument()
      expect(screen.getByText(/ago\(2020-01-01T00:01:00Z\)/)).toBeInTheDocument()
    })
  })

  describe('Different States', () => {
    test('shows placeholder when no active agent selected', () => {
      render(<DetailsPanel {...defaultProps} activeAgentId={null} activeThreadId={null} />)

      // Should show agent name as dash in agent information section
      expect(screen.getByText('Agent information')).toBeInTheDocument()
      const agentSection = screen.getByText('Agent information').parentElement
      expect(agentSection).toHaveTextContent('Name: —')
      // Should show thread ID as dash
      expect(screen.getByText((content, element) => {
        return element?.textContent === 'Thread ID: —'
      })).toBeInTheDocument()
    })

    test('shows zero message count when no messages', () => {
      render(<DetailsPanel {...defaultProps} messagesForActive={[]} />)

      expect(screen.getByText((content, element) => {
        return element?.textContent === 'Messages: 0'
      })).toBeInTheDocument()
      expect(screen.getByText((content, element) => {
        return element?.textContent === 'Last activity: —'
      })).toBeInTheDocument()
    })

    test('handles agent not found in agents list', () => {
      render(<DetailsPanel {...defaultProps} activeAgentId={999} />)

      const agentSection = screen.getByText('Agent information').parentElement
      expect(agentSection).toHaveTextContent('Name: —')
    })
  })

  describe('System Prompt Display', () => {
    test('displays system prompt for active agent', () => {
      render(<DetailsPanel {...defaultProps} />)

      expect(screen.getByText('System Prompt:')).toBeInTheDocument()
      expect(screen.getByText('You are a helpful assistant.')).toBeInTheDocument()
    })

    test('displays placeholder when agent has no system prompt', () => {
      render(<DetailsPanel {...defaultProps} activeAgentId={2} />)

      expect(screen.getByText('System Prompt:')).toBeInTheDocument()
      expect(screen.getByText('No system prompt set')).toBeInTheDocument()
    })

    test('displays placeholder when no active agent selected', () => {
      render(<DetailsPanel {...defaultProps} activeAgentId={null} />)

      expect(screen.getByText('System Prompt:')).toBeInTheDocument()
      expect(screen.getByText('No system prompt set')).toBeInTheDocument()
    })

    test('system prompt container has proper styling classes', () => {
      render(<DetailsPanel {...defaultProps} />)

      const systemPromptContainer = screen.getByText('You are a helpful assistant.').closest('div')
      expect(systemPromptContainer).toHaveClass('mt-1', 'p-2', 'bg-gray-50', 'dark:bg-gray-800', 'rounded', 'text-xs', 'leading-relaxed', 'max-h-32', 'overflow-y-auto')
    })

    test('displays long system prompts with scroll', () => {
      const longPrompt = 'This is a very long system prompt that tests scrolling behavior'
      const agentWithLongPrompt = { 
        id: 3, 
        name: 'Long Prompt Agent', 
        system_prompt: longPrompt 
      }
      
      render(<DetailsPanel 
        {...defaultProps} 
        agents={[...defaultProps.agents, agentWithLongPrompt]}
        activeAgentId={3}
      />)

      expect(screen.getByText(longPrompt)).toBeInTheDocument()
      const container = screen.getByText(longPrompt).closest('div')
      expect(container).toHaveClass('overflow-y-auto')
    })
  })

  describe('Edit Functionality', () => {
    test('displays edit button when active agent exists', () => {
      render(<DetailsPanel {...defaultProps} />)

      const editButton = screen.getByLabelText('Edit agent')
      expect(editButton).toBeInTheDocument()
      expect(editButton).toHaveAttribute('aria-label', 'Edit agent')
    })

    test('does not display edit button when no active agent', () => {
      render(<DetailsPanel {...defaultProps} activeAgentId={null} />)

      expect(screen.queryByLabelText('Edit agent')).not.toBeInTheDocument()
    })

    test('edit button has proper styling', () => {
      render(<DetailsPanel {...defaultProps} />)

      const editButton = screen.getByLabelText('Edit agent')
      expect(editButton).toHaveClass('p-1', 'rounded', 'hover:bg-gray-100', 'dark:hover:bg-gray-800', 'text-gray-500', 'hover:text-gray-700', 'dark:hover:text-gray-300')
    })

    test('opens edit modal when edit button is clicked', async () => {
      const user = userEvent.setup()
      render(<DetailsPanel {...defaultProps} />)

      const editButton = screen.getByLabelText('Edit agent')
      await user.click(editButton)

      // Modal should be opened
      expect(screen.getByText('Edit Agent')).toBeInTheDocument()
    })

    test('edit modal displays current agent data', async () => {
      const user = userEvent.setup()
      render(<DetailsPanel {...defaultProps} />)

      const editButton = screen.getByLabelText('Edit agent')
      await user.click(editButton)

      expect(screen.getByDisplayValue('Agent A')).toBeInTheDocument()
      expect(screen.getByDisplayValue('You are a helpful assistant.')).toBeInTheDocument()
    })

    test('calls onUpdateAgent when modal form is submitted', async () => {
      const user = userEvent.setup()
      render(<DetailsPanel {...defaultProps} />)

      const editButton = screen.getByLabelText('Edit agent')
      await user.click(editButton)

      const nameInput = screen.getByLabelText('Agent Name')
      const updateButton = screen.getByRole('button', { name: 'Update Agent' })

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Agent Name')
      await user.click(updateButton)

      expect(defaultProps.onUpdateAgent).toHaveBeenCalledWith(1, 'Updated Agent Name', 'You are a helpful assistant.')
    })

    test('closes edit modal when cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<DetailsPanel {...defaultProps} />)

      const editButton = screen.getByLabelText('Edit agent')
      await user.click(editButton)

      expect(screen.getByText('Edit Agent')).toBeInTheDocument()

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      expect(screen.queryByText('Edit Agent')).not.toBeInTheDocument()
    })
  })

  describe('Agent Information Updates', () => {
    test('updates displayed agent info when different agent becomes active', () => {
      const { rerender } = render(<DetailsPanel {...defaultProps} />)

      expect(screen.getByText('Agent A')).toBeInTheDocument()
      expect(screen.getByText('You are a helpful assistant.')).toBeInTheDocument()

      rerender(<DetailsPanel {...defaultProps} activeAgentId={2} />)

      expect(screen.getByText('Agent B')).toBeInTheDocument()
      expect(screen.getByText('No system prompt set')).toBeInTheDocument()
    })

    test('handles agent with empty string system prompt', () => {
      const agentWithEmptyPrompt = { 
        id: 4, 
        name: 'Empty Prompt Agent', 
        system_prompt: '' 
      }
      
      render(<DetailsPanel 
        {...defaultProps} 
        agents={[...defaultProps.agents, agentWithEmptyPrompt]}
        activeAgentId={4}
      />)

      expect(screen.getByText('No system prompt set')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    test('has proper semantic structure and labels', () => {
      render(<DetailsPanel {...defaultProps} />)

      const detailsPanel = screen.getByRole('complementary', { name: 'Details' })
      expect(detailsPanel).toBeInTheDocument()
      expect(detailsPanel).toHaveAttribute('aria-label', 'Details')
    })

    test('edit button has proper accessibility attributes', () => {
      render(<DetailsPanel {...defaultProps} />)

      const editButton = screen.getByLabelText('Edit agent')
      expect(editButton).toHaveAttribute('aria-label', 'Edit agent')
    })

    test('system prompt content is properly structured for screen readers', () => {
      render(<DetailsPanel {...defaultProps} />)

      const systemPromptLabel = screen.getByText('System Prompt:')
      expect(systemPromptLabel).toHaveClass('font-medium')
      
      const systemPromptContent = screen.getByText('You are a helpful assistant.')
      expect(systemPromptContent.parentElement).toBeInTheDocument()
    })
  })
})


