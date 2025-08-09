import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ConversationsSidebar from '../ConversationsSidebar'

describe('ConversationsSidebar', () => {
  const agents = [
    { id: 1, name: 'Alpha' },
    { id: 2, name: 'Beta' },
  ]

  test('renders agents and toggles collapse', () => {
    const setActiveAgentId = jest.fn()
    const setLeftCollapsed = jest.fn()
    render(
      <ConversationsSidebar
        agents={agents}
        activeAgentId={1}
        setActiveAgentId={setActiveAgentId}
        leftCollapsed={false}
        setLeftCollapsed={setLeftCollapsed}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(setLeftCollapsed).toHaveBeenCalledWith(true)

    fireEvent.click(screen.getByRole('link', { name: /Alpha/ }))
    expect(setActiveAgentId).toHaveBeenCalledWith(1)
  })
})


