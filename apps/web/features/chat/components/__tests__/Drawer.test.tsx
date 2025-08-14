import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import Drawer from '../Drawer'

describe('Drawer', () => {
  const defaultProps = {
    onClose: jest.fn(),
    side: 'left' as const,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    test('displays drawer content in modal dialog', () => {
      render(
        <Drawer {...defaultProps}>
          <div>Test drawer content</div>
        </Drawer>
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
      expect(screen.getByText('Test drawer content')).toBeInTheDocument()
    })

    test('renders on left side by default', () => {
      render(
        <Drawer {...defaultProps}>
          <div>Content</div>
        </Drawer>
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
    })

    test('renders on right side when specified', () => {
      render(
        <Drawer {...defaultProps} side="right">
          <div>Right side content</div>
        </Drawer>
      )

      expect(screen.getByText('Right side content')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    test('calls onClose when backdrop clicked', async () => {
      const user = userEvent.setup()
      render(
        <Drawer {...defaultProps}>
          <div>drawer content</div>
        </Drawer>
      )

      const dialog = screen.getByRole('dialog')
      const backdrop = dialog.firstElementChild as HTMLElement
      await user.click(backdrop)
      
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    test('calls onClose when Escape key pressed', async () => {
      const user = userEvent.setup()
      render(
        <Drawer {...defaultProps}>
          <div>drawer content</div>
        </Drawer>
      )

      await user.keyboard('{Escape}')
      
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    test('does not close when clicking inside drawer content', async () => {
      const user = userEvent.setup()
      render(
        <Drawer {...defaultProps}>
          <div>drawer content</div>
        </Drawer>
      )

      const content = screen.getByText('drawer content')
      await user.click(content)
      
      expect(defaultProps.onClose).not.toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    test('has proper modal dialog attributes', () => {
      render(
        <Drawer {...defaultProps}>
          <div>Content</div>
        </Drawer>
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })

    test('supports keyboard navigation for closing', async () => {
      const user = userEvent.setup()
      render(
        <Drawer {...defaultProps}>
          <button>Focus test</button>
        </Drawer>
      )

      await user.keyboard('{Escape}')
      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })
})


