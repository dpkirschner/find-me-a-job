import React from 'react'
import type { Agent, UIMessage } from '../types'
import { timeAgo } from '../../../lib/time'

export interface DetailsPanelProps {
  agents: Agent[]
  activeAgentId: number | null
  messagesForActive: UIMessage[]
}

export function DetailsPanel({ agents, activeAgentId, messagesForActive }: DetailsPanelProps) {
  return (
    <aside className="hidden md:flex flex-col border-l w-[320px]" aria-label="Details">
      <div className="px-3 py-3 border-b flex items-center justify-between">
        <div className="font-medium">Details</div>
      </div>
      <div className="p-3 space-y-3 overflow-auto">
        <div className="text-sm text-gray-500">Agent information</div>
        <div className="text-sm">
          <span className="font-medium">Name:</span>{' '}
          {agents.find((a) => a.id === activeAgentId)?.name || '—'}
        </div>
        <div className="text-sm">
          <span className="font-medium">Messages:</span> {messagesForActive.length}
        </div>
        <div className="text-sm">
          <span className="font-medium">Last activity:</span>{' '}
          {messagesForActive.length ? timeAgo(messagesForActive[messagesForActive.length - 1]?.created_at) : '—'}
        </div>
      </div>
    </aside>
  )
}

export default DetailsPanel


