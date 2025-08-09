import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ChatHeader from '../ChatHeader'

describe('ChatHeader', () => {
  test('renders and triggers actions', () => {
    const setDark = jest.fn()
    const openLeft = jest.fn()
    const openRight = jest.fn()
    render(
      <ChatHeader dark={false} setDark={setDark} openLeft={openLeft} openRight={openRight} />
    )

    fireEvent.click(screen.getByLabelText('Open conversations'))
    expect(openLeft).toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('Toggle theme'))
    expect(setDark).toHaveBeenCalledWith(true)

    fireEvent.click(screen.getByLabelText('Open details'))
    expect(openRight).toHaveBeenCalled()

    expect(screen.getByPlaceholderText('Search messages')).toBeInTheDocument()
  })
})


