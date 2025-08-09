import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Drawer from '../Drawer'

describe('Drawer', () => {
  test('renders content and calls onClose on backdrop click', () => {
    const onClose = jest.fn()
    render(
      <Drawer onClose={onClose} side="left">
        <div>drawer content</div>
      </Drawer>
    )

    expect(screen.getByText('drawer content')).toBeInTheDocument()
    const backdrop = screen.getByRole('dialog').firstElementChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })
})


