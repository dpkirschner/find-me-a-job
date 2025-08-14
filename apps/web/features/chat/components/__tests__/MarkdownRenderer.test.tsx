import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import MarkdownRenderer from '../MarkdownRenderer'

describe('MarkdownRenderer', () => {
  describe('Markdown Parsing', () => {
    test('renders basic markdown elements correctly', () => {
      render(<MarkdownRenderer>{'# Title\n\nSome **bold** text'}</MarkdownRenderer>)
      
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title')
      expect(screen.getByText((content, element) => {
        return element?.textContent === 'Some bold text'
      })).toBeInTheDocument()
    })

    test('renders code blocks with proper styling', () => {
      const codeContent = '```javascript\nconst test = true;\n```'
      render(<MarkdownRenderer>{codeContent}</MarkdownRenderer>)
      
      const codeBlock = screen.getByText('const test = true;')
      expect(codeBlock.closest('pre')).toBeInTheDocument()
    })

    test('renders inline code with styling', () => {
      render(<MarkdownRenderer>{'Here is some `inline code` text'}</MarkdownRenderer>)
      
      const inlineCode = screen.getByText('inline code')
      expect(inlineCode.tagName).toBe('CODE')
    })

    test('renders links with proper attributes', () => {
      render(<MarkdownRenderer>{'Check out [this link](https://example.com)'}</MarkdownRenderer>)
      
      const link = screen.getByRole('link', { name: 'this link' })
      expect(link).toHaveAttribute('href', 'https://example.com')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer noopener')
    })

    test('handles lists and multiple elements', () => {
      const markdown = `
# Heading
- Item 1
- Item 2
- Item 3

**Bold text** and *italic text*
      `.trim()
      
      render(<MarkdownRenderer>{markdown}</MarkdownRenderer>)
      
      expect(screen.getByRole('heading')).toHaveTextContent('Heading')
      expect(screen.getByRole('list')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
    })
  })

  describe('Content Formatting', () => {
    test('preserves whitespace in paragraphs', () => {
      render(<MarkdownRenderer>{'Line 1\nLine 2\nLine 3'}</MarkdownRenderer>)
      
      // The component uses whitespace-pre-wrap class for paragraphs
      const paragraph = screen.getByText(/Line 1/)
      expect(paragraph.className).toContain('whitespace-pre-wrap')
    })

    test('handles empty content gracefully', () => {
      render(<MarkdownRenderer>{''}</MarkdownRenderer>)
      
      // Should render without errors
      expect(document.body).toBeInTheDocument()
    })
  })

  describe('Advanced Markdown Features', () => {
    test('supports GitHub Flavored Markdown features', () => {
      const gfmContent = `
| Column 1 | Column 2 |
|----------|----------|
| Cell 1   | Cell 2   |

~~Strikethrough text~~
      `.trim()
      
      render(<MarkdownRenderer>{gfmContent}</MarkdownRenderer>)
      
      // Table should render
      expect(screen.getByRole('table')).toBeInTheDocument()
      expect(screen.getByRole('cell', { name: 'Cell 1' })).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    test('maintains semantic HTML structure', () => {
      const markdown = `
# Main Heading
## Subheading
[External Link](https://example.com)
      `.trim()
      
      render(<MarkdownRenderer>{markdown}</MarkdownRenderer>)
      
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
      expect(screen.getByRole('link')).toBeInTheDocument()
    })
  })
})


