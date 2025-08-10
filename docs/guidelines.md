# Development Guidelines

## React Testing Library Best Practices

This guide outlines the testing standards and best practices for our React components to ensure consistent, maintainable, and user-focused tests.

### Core Principles

1. **Test from the user's perspective** - Focus on what users see and do, not implementation details
2. **Use semantic queries** - Query elements the way users would find them
3. **Test behavior, not implementation** - Verify outcomes rather than internal state changes
4. **Write maintainable tests** - Tests should be easy to read, update, and debug

### Essential Imports and Setup

```typescript
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import ComponentUnderTest from '../ComponentUnderTest'
```

### Test Structure and Organization

#### 1. Use Descriptive Test Organization
```typescript
describe('ComponentName', () => {
  describe('Rendering', () => {
    // Tests for what renders correctly
  })
  
  describe('User Interactions', () => {
    // Tests for user behavior
  })
  
  describe('Edge Cases', () => {
    // Tests for error states, empty states, etc.
  })
  
  describe('Accessibility', () => {
    // Tests for ARIA roles, labels, etc.
  })
})
```

#### 2. Consistent Test Setup
```typescript
describe('ComponentName', () => {
  const defaultProps = {
    prop1: 'value1',
    onAction: jest.fn(),
    // ... other props
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Any additional setup
  })
})
```

### Query Best Practices

#### Priority Order (use in this order of preference):

1. **Accessible Queries (Preferred)**
   - `getByRole()` - Most semantic, mirrors how users navigate
   - `getByLabelText()` - Form elements with labels
   - `getByPlaceholderText()` - Form inputs
   - `getByText()` - Text content users see

2. **Secondary Queries**
   - `getByDisplayValue()` - Form elements with values
   - `getByAltText()` - Images with alt text
   - `getByTitle()` - Elements with title attributes

3. **Last Resort**
   - `getByTestId()` - When semantic queries aren't possible

#### Examples:
```typescript
//  Good - semantic queries
expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
expect(screen.getByLabelText('Email address')).toHaveValue('test@example.com')

// L Avoid - implementation details
expect(container.querySelector('.submit-btn')).toBeInTheDocument()
```

### User Interaction Testing

#### Use userEvent for all user interactions:
```typescript
test('submits form when button clicked', async () => {
  const user = userEvent.setup()
  const mockSubmit = jest.fn()
  
  render(<MyForm onSubmit={mockSubmit} />)
  
  await user.type(screen.getByLabelText('Name'), 'John Doe')
  await user.click(screen.getByRole('button', { name: 'Submit' }))
  
  expect(mockSubmit).toHaveBeenCalledWith({ name: 'John Doe' })
})
```

### Mock Management

#### 1. Dynamic Mocks for Flexible Testing
```typescript
const mockHook = jest.fn()
jest.mock('../hooks/useCustomHook', () => ({
  __esModule: true,
  default: () => mockHook(),
}))

// In tests, change behavior:
mockHook.mockReturnValue({ loading: true, data: null })
```

#### 2. Mock Cleanup
```typescript
beforeEach(() => {
  jest.clearAllMocks()
  // Reset any global mocks
})
```

### Async Testing

#### Use waitFor for asynchronous assertions:
```typescript
test('shows loading then success message', async () => {
  render(<AsyncComponent />)
  
  // Initial state
  expect(screen.getByText('Loading...')).toBeInTheDocument()
  
  // Wait for async operation
  await waitFor(() => {
    expect(screen.getByText('Success!')).toBeInTheDocument()
  })
  
  expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
})
```

### Testing Different States

#### 1. Empty States
```typescript
test('shows empty state when no data', () => {
  mockHook.mockReturnValue({ data: [], loading: false })
  
  render(<DataList />)
  
  expect(screen.getByText('No items found')).toBeInTheDocument()
})
```

#### 2. Loading States
```typescript
test('shows loading indicator while fetching', () => {
  mockHook.mockReturnValue({ loading: true, data: null })
  
  render(<DataComponent />)
  
  expect(screen.getByRole('progressbar')).toBeInTheDocument()
})
```

#### 3. Error States
```typescript
test('displays error message on failure', () => {
  mockHook.mockReturnValue({ error: 'Failed to load', data: null })
  
  render(<DataComponent />)
  
  expect(screen.getByRole('alert')).toHaveTextContent('Failed to load')
})
```

### Accessibility Testing

#### Always include accessibility checks:
```typescript
describe('Accessibility', () => {
  test('has proper ARIA roles and labels', () => {
    render(<Component />)
    
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Close dialog')
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })
  
  test('supports keyboard navigation', async () => {
    const user = userEvent.setup()
    render(<Component />)
    
    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
  })
})
```

### Common Patterns and Solutions

#### 1. Testing Components with Complex Props
```typescript
const defaultProps = {
  items: [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
  ],
  onSelect: jest.fn(),
  loading: false,
  error: null,
}

test('renders with custom props', () => {
  const customProps = {
    ...defaultProps,
    loading: true,
  }
  
  render(<Component {...customProps} />)
  
  expect(screen.getByRole('progressbar')).toBeInTheDocument()
})
```

#### 2. Testing Modal/Dialog Components
```typescript
test('opens and closes modal', async () => {
  const user = userEvent.setup()
  render(<ComponentWithModal />)
  
  await user.click(screen.getByRole('button', { name: 'Open Modal' }))
  
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  
  await user.click(screen.getByRole('button', { name: 'Close' }))
  
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

#### 3. Testing Form Components
```typescript
test('validates and submits form', async () => {
  const user = userEvent.setup()
  const mockSubmit = jest.fn()
  
  render(<ContactForm onSubmit={mockSubmit} />)
  
  // Fill form
  await user.type(screen.getByLabelText('Email'), 'invalid-email')
  await user.click(screen.getByRole('button', { name: 'Submit' }))
  
  // Check validation
  expect(screen.getByText('Please enter a valid email')).toBeInTheDocument()
  expect(mockSubmit).not.toHaveBeenCalled()
  
  // Fix and resubmit
  await user.clear(screen.getByLabelText('Email'))
  await user.type(screen.getByLabelText('Email'), 'valid@example.com')
  await user.click(screen.getByRole('button', { name: 'Submit' }))
  
  expect(mockSubmit).toHaveBeenCalledWith({ email: 'valid@example.com' })
})
```

### What NOT to Test

#### Avoid these anti-patterns:
- L Testing implementation details (internal state, method calls)
- L Testing third-party library functionality
- L Testing styling/CSS (unless it affects behavior)
- L Shallow rendering when you need full component behavior
- L Testing props directly instead of their effects

### Test File Naming and Structure

```
components/
  MyComponent.tsx
  __tests__/
    MyComponent.test.tsx    #  Clear naming
    MyComponent.spec.tsx    #  Alternative naming
```

### Environment Setup Requirements

Ensure your test files include:
1. Jest DOM matchers: `import '@testing-library/jest-dom'`
2. Proper cleanup: `beforeEach(() => jest.clearAllMocks())`
3. User event setup: `const user = userEvent.setup()`
4. Appropriate timeout values for async operations

### Example: Complete Test File Structure

```typescript
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import MyComponent from '../MyComponent'

// Mock dependencies
const mockCallback = jest.fn()
jest.mock('../hooks/useCustomHook', () => ({
  __esModule: true,
  default: () => mockCustomHook(),
}))

describe('MyComponent', () => {
  const defaultProps = {
    title: 'Test Title',
    onAction: mockCallback,
    items: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    test('renders title and basic elements', () => {
      render(<MyComponent {...defaultProps} />)
      
      expect(screen.getByText('Test Title')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    test('calls callback when button clicked', async () => {
      const user = userEvent.setup()
      render(<MyComponent {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Action' }))

      expect(mockCallback).toHaveBeenCalledTimes(1)
    })
  })

  describe('Different States', () => {
    test('shows loading state', () => {
      mockCustomHook.mockReturnValue({ loading: true })
      
      render(<MyComponent {...defaultProps} />)
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    test('has proper ARIA attributes', () => {
      render(<MyComponent {...defaultProps} />)
      
      expect(screen.getByRole('button')).toHaveAttribute('aria-label')
    })
  })
})
```

Following these guidelines will ensure consistent, maintainable, and user-focused tests across the entire codebase.