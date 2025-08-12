import React, { useState } from 'react'
import type { Agent } from '../types'
import classNames from '../../../lib/classNames'
import { CreateAgentModal } from './CreateAgentModal'

export function HashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 9h14M5 15h14M11 4 7 20M17 4l-4 16" />
    </svg>
  )
}

export interface SidebarItemProps {
  label: string
  active?: boolean
  onClick?: () => void
  onDelete?: () => void
}

export function SidebarItem({ label, active, onClick, onDelete }: SidebarItemProps) {
  return (
    <div
      className={classNames(
        'w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 group',
        active ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-100' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      )}
    >
      <button
        key="main-button"
        onClick={onClick}
        role="link"
        aria-current={active ? 'page' : undefined}
        className="flex items-center gap-2 flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      >
        <HashIcon />
        <span className="truncate">{label}</span>
      </button>
      {onDelete && (
        <button
          key="delete-button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label={`Delete ${label}`}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-opacity"
        >
          <XIcon />
        </button>
      )}
    </div>
  )
}

export interface ConversationsSidebarProps {
  agents: Agent[]
  activeAgentId: number | null
  setActiveAgentId: (id: number) => void
  leftCollapsed: boolean
  setLeftCollapsed: (v: boolean) => void
  onCreateAgent: (name: string) => void
  onDeleteAgent: (agentId: number) => void
}

export function ChevronLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}
export function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14m-7-7h14" />
    </svg>
  )
}

export function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function ConversationsSidebar({ agents, activeAgentId, setActiveAgentId, leftCollapsed, setLeftCollapsed, onCreateAgent, onDeleteAgent }: ConversationsSidebarProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  return (
    <aside
      className={classNames(
        'hidden md:flex flex-col border-r transition-[width] duration-200 select-none',
        leftCollapsed ? 'w-[60px]' : 'w-[280px]'
      )}
      aria-label="Conversations"
    >
      <div className="flex items-center justify-between gap-2 px-2 py-2 border-b">
        <div className="flex items-center gap-2">
          {/* icon placeholder to align text */}
          <span className="inline-block w-4" />
          {!leftCollapsed && <span className="font-medium">Conversations</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            aria-label={leftCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {leftCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        </div>
      </div>
      <nav className="p-2 space-y-1 overflow-y-auto flex-1" role="navigation" aria-label="Conversation list">
        {agents.length === 0 && <div key="no-agents" className="text-sm text-gray-500 px-2 py-4">No agents yet</div>}
        {agents.map((a) => (
          <SidebarItem 
            key={a.id} 
            label={a.name} 
            active={a.id === activeAgentId || false} 
            onClick={() => setActiveAgentId(a.id)}
            onDelete={() => onDeleteAgent(a.id)}
          />
        ))}
      </nav>
      
      <div className="p-2 border-t">
        <button
          onClick={() => setIsModalOpen(true)}
          className={classNames(
            'w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
          )}
          aria-label="Create new agent"
        >
          <PlusIcon />
          {!leftCollapsed && <span>New Agent</span>}
        </button>
      </div>
      
      <CreateAgentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreateAgent={onCreateAgent}
      />
    </aside>
  )
}

export default ConversationsSidebar


