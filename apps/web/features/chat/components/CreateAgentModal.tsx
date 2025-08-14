import React, { useState } from 'react'

interface CreateAgentModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateAgent: (name: string, systemPrompt?: string) => void
}

export function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function CreateAgentModal({ isOpen, onClose, onCreateAgent }: CreateAgentModalProps) {
  const [agentName, setAgentName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (agentName.trim()) {
      onCreateAgent(agentName.trim(), systemPrompt.trim() || undefined)
      setAgentName('')
      setSystemPrompt('')
      onClose()
    }
  }

  const handleClose = () => {
    setAgentName('')
    setSystemPrompt('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={handleClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Create New Agent</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close modal"
          >
            <XIcon />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="agentName" className="block text-sm font-medium mb-2">
              Agent Name
            </label>
            <input
              id="agentName"
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Enter agent name"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label htmlFor="systemPrompt" className="block text-sm font-medium mb-2">
              System Prompt <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter system prompt to guide the agent's behavior..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 resize-none"
            />
          </div>
          
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!agentName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Agent
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}