'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

// -----------------------------
// Types matching your backend
// -----------------------------
interface Agent { id: number; name: string }
interface ApiAgents { agents: Agent[] }
interface ApiMessage { id: number; agent_id: number; role: 'user' | 'assistant' | 'system'; content: string; created_at: string }
interface ApiMessages { messages: ApiMessage[] }

// Local UI message (during compose/stream)
interface UIMessage { role: 'user' | 'assistant' | 'system'; content: string; id?: string; created_at?: string }

// -----------------------------
// Small utils
// -----------------------------
const logger = {
  debug: (...a: unknown[]) => console.log('[UI DEBUG]', ...a),
  info: (...a: unknown[]) => console.log('[UI INFO]', ...a),
  error: (...a: unknown[]) => console.error('[UI ERROR]', ...a),
}

const isControlToken = (data: string) => data === '[DONE]'

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function timeAgo(iso?: string) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

// -----------------------------
// Theme toggle (no deps)
// -----------------------------
function useTheme() {
  const [dark, setDark] = useState<boolean>(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [dark])
  return { dark, setDark }
}

// -----------------------------
// App Component
// -----------------------------
export default function MultiAgentChat() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [activeAgentId, setActiveAgentId] = useState<number | null>(null)
  const [agentMessages, setAgentMessages] = useState<Record<number, UIMessage[]>>({})
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false)
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { dark, setDark } = useTheme()

  // Fetch agents on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('http://localhost:8000/agents', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed agents: ${res.status}`)
        const data: ApiAgents = await res.json()
        if (cancelled) return
        setAgents(data.agents)
        if (data.agents.length && activeAgentId == null) setActiveAgentId(data.agents[0].id)
      } catch (e) {
        logger.error('Failed to load agents', e)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Load messages for the active agent
  useEffect(() => {
    if (activeAgentId == null) return
    if (agentMessages[activeAgentId]) return // already loaded this session
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`http://localhost:8000/agents/${activeAgentId}/messages`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed messages: ${res.status}`)
        const data: ApiMessages = await res.json()
        if (cancelled) return
        const formatted: UIMessage[] = data.messages.map(m => ({ role: (m.role as UIMessage['role']), content: m.content, created_at: m.created_at }))
        setAgentMessages(prev => ({ ...prev, [activeAgentId]: formatted }))
      } catch (e) {
        logger.error('Failed to load messages for agent', activeAgentId, e)
        setAgentMessages(prev => ({ ...prev, [activeAgentId]: [] }))
      }
    })()
    return () => { cancelled = true }
  }, [activeAgentId])

  const messagesForActive = useMemo(() => (activeAgentId != null ? (agentMessages[activeAgentId] || []) : []), [agentMessages, activeAgentId])

  // Scroll to bottom on new messages
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messagesForActive.length])

  // Submit handler (streams from /chat — backend currently does not accept agent_id)
  const onSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!input.trim() || isLoading || activeAgentId == null) return

    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)
    setIsStreaming(true)

    // Optimistically append user + empty assistant placeholders in this agent thread only
    const userMsg: UIMessage = { role: 'user', content: input, id: crypto.randomUUID(), created_at: new Date().toISOString() }
    const assistantMsg: UIMessage = { role: 'assistant', content: '', id: crypto.randomUUID(), created_at: new Date().toISOString() }
    setAgentMessages(prev => ({ ...prev, [activeAgentId]: [ ...(prev[activeAgentId] || []), userMsg, assistantMsg ] }))
    setInput('')

    try {
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content /* TODO: include agent id when backend supports it */ }),
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${response.status}`)
      }
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No stream reader')
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true }).replace(/\r/g, '')
        buffer += chunk
        const SEP = '\n\n'
        let idx: number
        while ((idx = buffer.indexOf(SEP)) !== -1) {
          const eventText = buffer.slice(0, idx)
          buffer = buffer.slice(idx + SEP.length)
          if (!eventText) continue
          const data = eventText.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n')
          if (!data) continue
          if (isControlToken(data)) { break }
          // Append to last assistant message in the active thread
          setAgentMessages(prev => {
            const arr = [...(prev[activeAgentId] || [])]
            for (let i = arr.length - 1; i >= 0; i--) {
              if (arr[i].role === 'assistant') { arr[i] = { ...arr[i], content: (arr[i].content || '') + data }; break }
            }
            return { ...prev, [activeAgentId]: arr }
          })
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        logger.info('Aborted by user')
        setAgentMessages(prev => {
          const arr = [...(prev[activeAgentId] || [])]
          const last = arr[arr.length - 1]
          if (last && last.role === 'assistant') last.content += '\n\n(Request stopped)'
          return { ...prev, [activeAgentId]: arr }
        })
      } else {
        logger.error('Stream error', err)
        setAgentMessages(prev => {
          const arr = [...(prev[activeAgentId] || [])]
          const last = arr[arr.length - 1]
          if (last && last.role === 'assistant') last.content = err?.message || 'Unknown error'
          return { ...prev, [activeAgentId]: arr }
        })
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [input, isLoading, activeAgentId])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  // -----------------------------
  // UI building blocks
  // -----------------------------
  function Header() {
    return (
      <header className="flex items-center gap-2 h-14 border-b bg-white/70 dark:bg-gray-900/60 backdrop-blur px-2 sm:px-3">
        <div className="flex items-center gap-2">
          {/* Mobile left drawer toggle */}
          <button
            onClick={() => setLeftDrawerOpen(true)}
            className="md:hidden p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Open conversations"
          >
            <MenuIcon />
          </button>
          <WorkspaceSwitcher />
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Searchbar />
          <button
            onClick={() => setDark(!dark)}
            aria-label="Toggle theme"
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          {/* Mobile right drawer toggle */}
          <button
            onClick={() => setRightDrawerOpen(true)}
            className="md:hidden p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Open details"
          >
            <InfoIcon />
          </button>
        </div>
      </header>
    )
  }

  function WorkspaceSwitcher() {
    return (
      <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-gray-800" aria-haspopup="listbox">
        <span className="font-medium">My Workspace</span>
        <ChevronDownIcon />
      </button>
    )
  }

  function Searchbar() {
    return (
      <div className="hidden sm:block relative">
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2" />
        <input
          aria-label="Search"
          placeholder="Search messages"
          className="pl-8 pr-3 py-1.5 rounded border bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    )
  }

  function SidebarItem({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
    return (
      <button
        onClick={onClick}
        role="link"
        aria-current={active ? 'page' : undefined}
        className={classNames(
          'w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          active ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-100' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        )}
      >
        <HashIcon />
        <span className="truncate">{label}</span>
      </button>
    )
  }

  function MessageBubble({ m, isLastStreaming }: { m: UIMessage; isLastStreaming?: boolean }) {
    const mine = m.role === 'user'
    const common = 'max-w-[85%] lg:max-w-[60ch] px-4 py-2 rounded-lg border text-sm leading-relaxed whitespace-pre-wrap break-words'
    const cls = mine
      ? 'bg-blue-500 text-white border-blue-500'
      : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700'
    return (
      <div className={classNames('flex', mine ? 'justify-end' : 'justify-start')}>
        <div className={classNames(common, cls)}>
          {isLastStreaming ? (
            <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}
              components={{
                p: (props) => <p className="whitespace-pre-wrap" {...props} />,
                a: (props) => <a className="text-blue-600 underline" target="_blank" rel="noreferrer noopener" {...props} />,
                pre: (props) => <pre className="bg-gray-100 dark:bg-gray-900 rounded p-3 my-2 overflow-x-auto" {...props} />,
                code: ({ inline, className, children, ...props }) => inline
                  ? <code className="bg-gray-100 dark:bg-gray-900 px-1 rounded" {...props}>{children}</code>
                  : <code className={className} {...props}>{children}</code>
              }}
            >
              {m.content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    )
  }

  function Composer() {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
        {isLoading && (
          <div className="flex justify-center mb-2">
            <button onClick={stop} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm">Stop</button>
          </div>
        )}
        <form onSubmit={onSubmit} className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() } }}
            placeholder={activeAgentId == null ? 'Pick an agent to start…' : 'Type your message… (Shift+Enter for newline)'}
            disabled={isLoading || activeAgentId == null}
            rows={1}
            className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || activeAgentId == null}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
            aria-label="Send"
          >
            Send
          </button>
        </form>
      </div>
    )
  }

  // -----------------------------
  // Layout
  // -----------------------------
  return (
    <div className="h-screen grid grid-rows-[auto_1fr] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header />

      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] min-h-0">
        {/* Left sidebar (desktop) */}
        <aside className={classNames('hidden md:flex flex-col border-r transition-[width] duration-200 select-none', leftCollapsed ? 'w-[60px]' : 'w-[280px]')} aria-label="Conversations">
          <div className="flex items-center justify-between gap-2 px-2 py-2 border-b">
            <div className="flex items-center gap-2">
              <UsersIcon />
              {!leftCollapsed && <span className="font-medium">Conversations</span>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setLeftCollapsed(!leftCollapsed)} aria-label={leftCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                {leftCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
              </button>
            </div>
          </div>
          <nav className="p-2 space-y-1 overflow-y-auto" role="navigation" aria-label="Conversation list">
            {agents.length === 0 && (
              <div className="text-sm text-gray-500 px-2 py-4">No agents yet</div>
            )}
            {agents.map((a) => (
              <SidebarItem key={a.id} label={a.name} active={a.id === activeAgentId} onClick={() => setActiveAgentId(a.id)} />
            ))}
          </nav>
        </aside>

        {/* Center panel */}
        <main className="min-h-0 flex flex-col" role="main">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <HashIcon />
            <div className="font-medium truncate">{agents.find(a => a.id === activeAgentId)?.name || 'Select an agent'}</div>
          </div>

          {/* Message list */}
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

          <Composer />
        </main>

        {/* Right sidebar (desktop) */}
        <aside className="hidden md:flex flex-col border-l w-[320px]" aria-label="Details">
          <div className="px-3 py-3 border-b flex items-center justify-between">
            <div className="font-medium">Details</div>
          </div>
          <div className="p-3 space-y-3 overflow-auto">
            <div className="text-sm text-gray-500">Agent information</div>
            <div className="text-sm"><span className="font-medium">Name:</span> {agents.find(a => a.id === activeAgentId)?.name || '—'}</div>
            <div className="text-sm"><span className="font-medium">Messages:</span> {messagesForActive.length}</div>
            <div className="text-sm"><span className="font-medium">Last activity:</span> {messagesForActive.length ? timeAgo(messagesForActive[messagesForActive.length - 1]?.created_at) : '—'}</div>
          </div>
        </aside>
      </div>

      {/* Left drawer (mobile) */}
      {leftDrawerOpen && (
        <Drawer onClose={() => setLeftDrawerOpen(false)} side="left">
          <div className="p-2">
            <div className="px-2 py-2 border-b flex items-center justify-between"><div className="font-medium">Conversations</div><button onClick={() => setLeftDrawerOpen(false)} aria-label="Close" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><XIcon /></button></div>
            <nav className="p-2 space-y-1" role="navigation">
              {agents.map((a) => (
                <SidebarItem key={a.id} label={a.name} active={a.id === activeAgentId} onClick={() => { setActiveAgentId(a.id); setLeftDrawerOpen(false) }} />
              ))}
            </nav>
          </div>
        </Drawer>
      )}

      {/* Right drawer (mobile) */}
      {rightDrawerOpen && (
        <Drawer onClose={() => setRightDrawerOpen(false)} side="right">
          <div className="p-2">
            <div className="px-2 py-2 border-b flex items-center justify-between"><div className="font-medium">Details</div><button onClick={() => setRightDrawerOpen(false)} aria-label="Close" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><XIcon /></button></div>
            <div className="p-3 space-y-3">
              <div className="text-sm"><span className="font-medium">Name:</span> {agents.find(a => a.id === activeAgentId)?.name || '—'}</div>
              <div className="text-sm"><span className="font-medium">Messages:</span> {messagesForActive.length}</div>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  )
}

// -----------------------------
// Generic Drawer (mobile)
// -----------------------------
function Drawer({ children, onClose, side = 'left' as 'left' | 'right' }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={classNames('absolute top-0 h-full w-80 bg-white dark:bg-gray-900 shadow-xl transition-transform', side === 'left' ? 'left-0' : 'right-0')}>
        {children}
      </div>
    </div>
  )
}

// -----------------------------
// Minimal inline icons (no deps)
// -----------------------------
function MenuIcon(props: React.SVGProps<SVGSVGElement>) { return (
  <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
)}
function SunIcon(props: React.SVGProps<SVGSVGElement>) { return (
  <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.364-7.364-1.414 1.414M8.05 16.95l-1.414 1.414m0-11.314L8.05 8.05m9.9 9.9 1.414-1.414"/></svg>
)}
function MoonIcon(props: React.SVGProps<SVGSVGElement>) { return (
  <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
)}
function InfoIcon(props: React.SVGProps<SVGSVGElement>) { return (
  <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
)}
function ChevronDownIcon(props: React.SVGProps<SVGSVGElement>) { return (
  <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
)}
function ChevronLeftIcon(props: React.SVGProps<SVGSVGElement>) { return (
  <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
)}
function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) { return (
  <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
)}
function SearchIcon(props: React.SVGProps<SVGSVGElement>) { return (
  <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={classNames('text-gray-400', props.className)}><circle cx="11" cy="11" r="8"/><path d="m21 21-3-3"/></svg>
)}
function UsersIcon(props: React.SVGProps<SVGSVGElement>) { return (
  <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
)}
function HashIcon(props: React.SVGProps<SVGSVGElement>) { return (
  <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 9h14M5 15h14M11 4 7 20M17 4l-4 16"/></svg>
)}
function XIcon(props: React.SVGProps<SVGSVGElement>) { return (
  <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
)}
