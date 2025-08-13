import React, { useState } from 'react'
import type { Agent, UIMessage } from '../types'
import { timeAgo } from '../../../lib/time'
import { EditAgentModal } from './EditAgentModal'

export interface DetailsPanelProps {
  agents: Agent[]
  activeAgentId: number | null
  activeThreadId: string | null
  messagesForActive: UIMessage[]
  onUpdateAgent: (agentId: number, name: string, systemPrompt?: string) => void
}

export function EditIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

export function DetailsPanel({ agents, activeAgentId, activeThreadId, messagesForActive, onUpdateAgent }: DetailsPanelProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const activeAgent = agents.find((a) => a.id === activeAgentId)

  return (
    <aside className="hidden md:flex flex-col border-l w-[320px]" aria-label="Details">
      <div className="px-3 py-3 border-b flex items-center justify-between">
        <div className="font-medium">Details</div>
        {activeAgent && (
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            aria-label="Edit agent"
          >
            <EditIcon />
          </button>
        )}
      </div>
      <div className="p-3 space-y-4 overflow-auto">
        <div>
          <div className="text-sm text-gray-500 mb-2">Agent information</div>
          <div className="text-sm space-y-2">
            <div>
              <span className="font-medium">Name:</span>{' '}
              {activeAgent?.name || '—'}
            </div>
            <div>
              <span className="font-medium">System Prompt:</span>
              <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs leading-relaxed max-h-32 overflow-y-auto">
                {activeAgent?.system_prompt || 
                  <span className="text-gray-500 italic">No system prompt set</span>
                }
              </div>
            </div>
          </div>
        </div>
        
        <div>
          <div className="text-sm text-gray-500 mb-2">Conversation details</div>
          <div className="text-sm space-y-1">
            <div>
              <span className="font-medium">Thread ID:</span>{' '}
              {activeThreadId ? `${activeThreadId.slice(-8)}` : '—'}
            </div>
            <div>
              <span className="font-medium">Messages:</span> {messagesForActive.length}
            </div>
            <div>
              <span className="font-medium">Last activity:</span>{' '}
              {messagesForActive.length ? timeAgo(messagesForActive[messagesForActive.length - 1]?.created_at) : '—'}
            </div>
          </div>
        </div>
      </div>
      
      <EditAgentModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        agent={activeAgent || null}
        onUpdateAgent={onUpdateAgent}
      />
    </aside>
  )
}

export default DetailsPanel


