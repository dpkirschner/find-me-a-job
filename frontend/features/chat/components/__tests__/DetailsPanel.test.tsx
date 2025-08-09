import React from 'react'
import { render, screen } from '@testing-library/react'
import DetailsPanel from '../DetailsPanel'

jest.mock('../../../../lib/time', () => ({
  __esModule: true,
  default: jest.fn((iso?: string) => `ago(${iso})`),
  timeAgo: jest.fn((iso?: string) => `ago(${iso})`),
}))

describe('DetailsPanel', () => {
  test('shows details summary', () => {
    render(
      <DetailsPanel
        agents={[{ id: 1, name: 'Agent A' }]}
        activeAgentId={1}
        messagesForActive={[{ role: 'user', content: 'hi', created_at: '2020-01-01T00:00:00Z' }]}
      />
    )

    expect(screen.getByText('Details')).toBeInTheDocument()
    expect(screen.getByText(/Agent information/)).toBeInTheDocument()
    expect(screen.getByText(/Agent A/)).toBeInTheDocument()
    expect(screen.getByText((content, element) => {
      return element?.textContent === 'Messages: 1'
    })).toBeInTheDocument()
    expect(screen.getByText(/ago\(2020-01-01T00:00:00Z\)/)).toBeInTheDocument()
  })
})


