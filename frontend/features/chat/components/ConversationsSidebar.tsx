import React, { useState } from 'react'
import type { Agent, Conversation } from '../types'
import classNames from '../../../lib/classNames'
import { CreateAgentModal } from './CreateAgentModal'
import { timeAgo } from '../../../lib/time'

export function HashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 9h14M5 15h14M11 4 7 20M17 4l-4 16" />
    </svg>
  )
}

export interface SidebarItemProps {
  label: string
  subtitle?: string
  active?: boolean
  onClick?: () => void
  onDelete?: () => void
}

export function SidebarItem({ label, subtitle, active, onClick, onDelete }: SidebarItemProps) {
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
        <div className="flex-1 min-w-0">
          <div className="truncate">{label}</div>
          {subtitle && (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</div>
          )}
        </div>
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
  conversations: Conversation[]
  activeThreadId: string | null
  setActiveAgentId: (id: number) => void
  setActiveThreadId: (threadId: string | null) => void
  leftCollapsed: boolean
  setLeftCollapsed: (v: boolean) => void
  onCreateAgent: (name: string) => void
  onDeleteAgent: (agentId: number) => void
  onCreateConversation: (agentId: number) => void
  onDeleteConversation: (threadId: string) => void
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

export function ConversationsSidebar({ 
  agents, 
  activeAgentId, 
  conversations, 
  activeThreadId, 
  setActiveAgentId, 
  setActiveThreadId, 
  leftCollapsed, 
  setLeftCollapsed, 
  onCreateAgent, 
  onDeleteAgent,
  onCreateConversation,
  onDeleteConversation
}: ConversationsSidebarProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // Group conversations by agent for the current active agent
  const currentAgentConversations = conversations?.filter(c => c.agent_id === activeAgentId) || []
  
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
      
      <nav className="flex-1 overflow-y-auto" role="navigation" aria-label="Conversation list">
        {/* Agents Section */}
        <div className="p-2 border-b">
          {!leftCollapsed && <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 px-2">AGENTS</div>}
          <div className="space-y-1">
            {agents.length === 0 && <div key="no-agents" className="text-sm text-gray-500 px-2 py-4">No agents yet</div>}
            {agents.map((agent) => (
              <SidebarItem 
                key={`agent-${agent.id}`}
                label={agent.name} 
                active={agent.id === activeAgentId} 
                onClick={() => setActiveAgentId(agent.id)}
                onDelete={() => onDeleteAgent(agent.id)}
              />
            ))}
          </div>
        </div>
        
        {/* Conversations Section */}
        {activeAgentId && (
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              {!leftCollapsed && (
                <>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2">
                    CONVERSATIONS
                  </div>
                  <button
                    onClick={() => onCreateConversation(activeAgentId)}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    aria-label="New conversation"
                  >
                    <PlusIcon />
                  </button>
                </>
              )}
            </div>
            <div className="space-y-1">
              {currentAgentConversations.length === 0 && !leftCollapsed && (
                <div className="text-sm text-gray-500 px-2 py-4">No conversations yet</div>
              )}
              {currentAgentConversations.map((conversation) => {
                // Check if this is a temporary conversation
                const isTemp = conversation.thread_id.startsWith('temp-')
                const label = isTemp 
                  ? 'Creating conversation...' 
                  : `Thread ${conversation.thread_id.slice(-8)}`
                const subtitle = isTemp 
                  ? 'Just now' 
                  : timeAgo(conversation.updated_at)
                
                return (
                  <SidebarItem 
                    key={`conv-${conversation.thread_id}`}
                    label={label}
                    subtitle={subtitle}
                    active={conversation.thread_id === activeThreadId} 
                    onClick={() => setActiveThreadId(conversation.thread_id)}
                    onDelete={isTemp ? undefined : () => onDeleteConversation(conversation.thread_id)}
                  />
                )
              })}
            </div>
          </div>
        )}
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


