import React from 'react'
import { render, screen } from '@testing-library/react'
import MarkdownRenderer from '../MarkdownRenderer'

describe('MarkdownRenderer', () => {
  test('renders markdown content', () => {
    render(<MarkdownRenderer>{'# Title\n\nSome **bold** text'}</MarkdownRenderer>)
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText((content, element) => {
      return element?.textContent === 'Some bold text'
    })).toBeInTheDocument()
  })
})


