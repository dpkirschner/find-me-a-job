import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import ConversationsSidebar from '../ConversationsSidebar'

describe('ConversationsSidebar', () => {
  const defaultProps = {
    agents: [
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Beta' },
    ],
    activeAgentId: 1 as number | null,
    setActiveAgentId: jest.fn(),
    leftCollapsed: false,
    setLeftCollapsed: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    test('displays sidebar with conversations title and agents', () => {
      render(<ConversationsSidebar {...defaultProps} />)

      expect(screen.getByRole('complementary', { name: 'Conversations' })).toBeInTheDocument()
      expect(screen.getByText('Conversations')).toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: 'Conversation list' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Alpha/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Beta/ })).toBeInTheDocument()
    })

    test('shows active agent with proper aria-current', () => {
      render(<ConversationsSidebar {...defaultProps} />)

      const activeAgent = screen.getByRole('link', { name: /Alpha/ })
      expect(activeAgent).toHaveAttribute('aria-current', 'page')
    })

    test('shows collapse button with correct label', () => {
      render(<ConversationsSidebar {...defaultProps} />)

      expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    test('collapses sidebar when collapse button clicked', async () => {
      const user = userEvent.setup()
      render(<ConversationsSidebar {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
      
      expect(defaultProps.setLeftCollapsed).toHaveBeenCalledWith(true)
    })

    test('expands sidebar when collapsed and expand button clicked', async () => {
      const user = userEvent.setup()
      render(<ConversationsSidebar {...defaultProps} leftCollapsed={true} />)

      await user.click(screen.getByRole('button', { name: 'Expand sidebar' }))
      
      expect(defaultProps.setLeftCollapsed).toHaveBeenCalledWith(false)
    })

    test('selects agent when agent button clicked', async () => {
      const user = userEvent.setup()
      render(<ConversationsSidebar {...defaultProps} />)

      await user.click(screen.getByRole('link', { name: /Beta/ }))
      
      expect(defaultProps.setActiveAgentId).toHaveBeenCalledWith(2)
    })
  })

  describe('Different States', () => {
    test('shows empty state when no agents provided', () => {
      render(<ConversationsSidebar {...defaultProps} agents={[]} />)

      expect(screen.getByText('No agents yet')).toBeInTheDocument()
    })

    test('hides conversation title when collapsed', () => {
      render(<ConversationsSidebar {...defaultProps} leftCollapsed={true} />)

      expect(screen.queryByText('Conversations')).not.toBeInTheDocument()
    })

    test('handles no active agent selected', () => {
      render(<ConversationsSidebar {...defaultProps} activeAgentId={null} />)

      const alphaAgent = screen.getByRole('link', { name: /Alpha/ })
      expect(alphaAgent).not.toHaveAttribute('aria-current')
    })
  })

  describe('Accessibility', () => {
    test('provides proper semantic structure and navigation', () => {
      render(<ConversationsSidebar {...defaultProps} />)

      expect(screen.getByRole('complementary')).toHaveAttribute('aria-label', 'Conversations')
      expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'Conversation list')
    })

    test('uses appropriate roles for interactive elements', () => {
      render(<ConversationsSidebar {...defaultProps} />)

      const collapseButton = screen.getByRole('button', { name: 'Collapse sidebar' })
      expect(collapseButton).toBeInTheDocument()
      
      const agentLinks = screen.getAllByRole('link')
      expect(agentLinks).toHaveLength(2) // 2 agent links
      
      const alphaLink = screen.getByRole('link', { name: /Alpha/ })
      expect(alphaLink).toBeInTheDocument()
    })
  })
})


