import React, { useMemo, useRef, useState } from 'react'
import useChat from '../hooks/useChat'
import classNames from '../../../lib/classNames'
import MessageBubble from './MessageBubble'
import Composer from './Composer'
import ChatHeader from './ChatHeader'
import ConversationsSidebar from './ConversationsSidebar'
import DetailsPanel from './DetailsPanel'
import Drawer from './Drawer'

function useTheme() {
  const [dark, setDark] = useState<boolean>(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )
  React.useEffect(() => {
    if (dark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [dark])
  return { dark, setDark }
}

export function ChatPage() {
  const { agents, activeAgentId, setActiveAgentId, messagesByAgent, isLoading, isStreaming, input, setInput, onSubmit, stop, createAgent } = useChat()
  const { dark, setDark } = useTheme()
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false)
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const messagesForActive = useMemo(
    () => (activeAgentId != null ? messagesByAgent[activeAgentId] || [] : []),
    [messagesByAgent, activeAgentId]
  )

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messagesForActive.length])

  return (
    <div className="h-screen grid grid-rows-[auto_1fr] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <ChatHeader dark={dark} setDark={setDark} openLeft={() => setLeftDrawerOpen(true)} openRight={() => setRightDrawerOpen(true)} />

      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] min-h-0">
        <ConversationsSidebar
          agents={agents}
          activeAgentId={activeAgentId}
          setActiveAgentId={setActiveAgentId}
          leftCollapsed={leftCollapsed}
          setLeftCollapsed={setLeftCollapsed}
          onCreateAgent={createAgent}
        />

        <main className="min-h-0 flex flex-col" role="main">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <span className="inline-block w-4" />
            <div className="font-medium truncate">{agents.find((a) => a.id === activeAgentId)?.name || 'Select an agent'}</div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2" role="feed" aria-busy={isLoading && isStreaming}>
            {activeAgentId == null ? (
              <div className="h-full grid place-items-center text-center text-gray-500">
                <div>
                  <div className="mx-auto mb-2 h-10 w-10 rounded-full grid place-items-center bg-gray-200 dark:bg-gray-800">💬</div>
                  <div className="font-medium">Pick an agent to start</div>
                  <div className="text-sm">Create or select a conversation in the left panel.</div>
                </div>
              </div>
            ) : messagesForActive.length === 0 ? (
              <div className="h-full grid place-items-center text-center text-gray-500">
                <div>
                  <div className="mx-auto mb-2 h-10 w-10 rounded-full grid place-items-center bg-gray-200 dark:bg-gray-800">#</div>
                  <div className="font-medium">No messages yet</div>
                  <div className="text-sm">Say hello to this agent.</div>
                </div>
              </div>
            ) : (
              messagesForActive.map((m, i) => (
                <MessageBubble key={i} m={m} isLastStreaming={isStreaming && i === messagesForActive.length - 1 && m.role === 'assistant'} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <Composer
            input={input}
            setInput={setInput}
            onSubmit={onSubmit}
            isLoading={isLoading}
            activeAgentId={activeAgentId}
            stop={stop}
          />
        </main>

        <DetailsPanel agents={agents} activeAgentId={activeAgentId} messagesForActive={messagesForActive} />
      </div>

      {leftDrawerOpen && (
        <Drawer onClose={() => setLeftDrawerOpen(false)} side="left">
          <div className="p-2">
            <div className="px-2 py-2 border-b flex items-center justify-between">
              <div className="font-medium">Conversations</div>
              <button onClick={() => setLeftDrawerOpen(false)} aria-label="Close" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                ✖
              </button>
            </div>
            <nav className="p-2 space-y-1" role="navigation">
              {agents.map((a) => (
                <button
                  key={a.id}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => {
                    setActiveAgentId(a.id)
                    setLeftDrawerOpen(false)
                  }}
                >
                  {a.name}
                </button>
              ))}
            </nav>
          </div>
        </Drawer>
      )}

      {rightDrawerOpen && (
        <Drawer onClose={() => setRightDrawerOpen(false)} side="right">
          <div className="p-2">
            <div className="px-2 py-2 border-b flex items-center justify-between">
              <div className="font-medium">Details</div>
              <button onClick={() => setRightDrawerOpen(false)} aria-label="Close" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                ✖
              </button>
            </div>
            <div className="p-3 space-y-3">
              <div className="text-sm">
                <span className="font-medium">Name:</span> {agents.find((a) => a.id === activeAgentId)?.name || '—'}
              </div>
              <div className="text-sm">
                <span className="font-medium">Messages:</span> {messagesForActive.length}
              </div>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  )
}

export default ChatPage


