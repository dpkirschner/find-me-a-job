import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import ChatHeader from '../ChatHeader'

describe('ChatHeader', () => {
  const defaultProps = {
    dark: false,
    setDark: jest.fn(),
    openLeft: jest.fn(),
    openRight: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    test('renders workspace title and search input', () => {
      render(<ChatHeader {...defaultProps} />)
      
      expect(screen.getByRole('button', { name: /my workspace/i })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Search' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument()
    })

    test('renders navigation buttons for mobile', () => {
      render(<ChatHeader {...defaultProps} />)
      
      expect(screen.getByRole('button', { name: 'Open conversations' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open details' })).toBeInTheDocument()
    })

    test('shows theme toggle button in both light and dark modes', () => {
      const { rerender } = render(<ChatHeader {...defaultProps} dark={false} />)
      
      expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument()
      
      rerender(<ChatHeader {...defaultProps} dark={true} />)
      
      expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    test('calls openLeft when conversations button clicked', async () => {
      const user = userEvent.setup()
      render(<ChatHeader {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Open conversations' }))
      
      expect(defaultProps.openLeft).toHaveBeenCalledTimes(1)
    })

    test('calls openRight when details button clicked', async () => {
      const user = userEvent.setup()
      render(<ChatHeader {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Open details' }))
      
      expect(defaultProps.openRight).toHaveBeenCalledTimes(1)
    })

    test('toggles theme between light and dark modes', async () => {
      const user = userEvent.setup()
      
      const { rerender } = render(<ChatHeader {...defaultProps} dark={false} />)
      
      await user.click(screen.getByRole('button', { name: 'Toggle theme' }))
      expect(defaultProps.setDark).toHaveBeenCalledWith(true)
      
      jest.clearAllMocks()
      rerender(<ChatHeader {...defaultProps} dark={true} />)
      
      await user.click(screen.getByRole('button', { name: 'Toggle theme' }))
      expect(defaultProps.setDark).toHaveBeenCalledWith(false)
    })

    test('accepts text input in search field', async () => {
      const user = userEvent.setup()
      render(<ChatHeader {...defaultProps} />)
      
      const searchInput = screen.getByRole('textbox', { name: 'Search' })
      
      await user.type(searchInput, 'test query')
      
      expect(searchInput).toHaveValue('test query')
    })
  })

  describe('Accessibility', () => {
    test('provides accessible labels for all interactive elements', () => {
      render(<ChatHeader {...defaultProps} />)
      
      expect(screen.getByRole('button', { name: 'Open conversations' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open details' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Search' })).toBeInTheDocument()
    })

    test('workspace button has dropdown indicator', () => {
      render(<ChatHeader {...defaultProps} />)
      
      const workspaceButton = screen.getByRole('button', { name: /my workspace/i })
      expect(workspaceButton).toHaveAttribute('aria-haspopup', 'listbox')
    })
  })
})


