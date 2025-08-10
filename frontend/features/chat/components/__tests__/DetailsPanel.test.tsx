import React from 'react'
import { render, screen } from '@testing-library/react'
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
      { id: 1, name: 'Agent A' },
      { id: 2, name: 'Agent B' },
    ],
    activeAgentId: 1 as number | null,
    messagesForActive: [
      { role: 'user' as const, content: 'hi', created_at: '2020-01-01T00:00:00Z' },
      { role: 'assistant' as const, content: 'hello', created_at: '2020-01-01T00:01:00Z' },
    ],
  }

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
      render(<DetailsPanel {...defaultProps} activeAgentId={null} />)

      expect(screen.getByText((content, element) => {
        return element?.textContent === 'Name: —'
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

      expect(screen.getByText((content, element) => {
        return element?.textContent === 'Name: —'
      })).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    test('has proper semantic structure and labels', () => {
      render(<DetailsPanel {...defaultProps} />)

      const detailsPanel = screen.getByRole('complementary', { name: 'Details' })
      expect(detailsPanel).toBeInTheDocument()
      expect(detailsPanel).toHaveAttribute('aria-label', 'Details')
    })
  })
})


