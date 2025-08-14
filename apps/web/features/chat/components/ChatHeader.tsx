import React from 'react'

export function MenuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.364-7.364-1.414 1.414M8.05 16.95l-1.414 1.414m0-11.314L8.05 8.05m9.9 9.9 1.414-1.414" />
    </svg>
  )
}

export function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  )
}

export function ChevronDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={["text-gray-400", props.className].filter(Boolean).join(' ')}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-3-3" />
    </svg>
  )
}

export interface HeaderProps {
  dark: boolean
  setDark: (v: boolean) => void
  openLeft: () => void
  openRight: () => void
}

export function ChatHeader({ dark, setDark, openLeft, openRight }: HeaderProps) {
  return (
    <header className="flex items-center gap-2 h-14 border-b bg-white/70 dark:bg-gray-900/60 backdrop-blur px-2 sm:px-3">
      <div className="flex items-center gap-2">
        <button onClick={openLeft} className="md:hidden p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Open conversations">
          <MenuIcon />
        </button>
        <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-gray-800" aria-haspopup="listbox">
          <span className="font-medium">My Workspace</span>
          <ChevronDownIcon />
        </button>
      </div>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <div className="hidden sm:block relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            aria-label="Search"
            placeholder="Search messages"
            className="pl-8 pr-3 py-1.5 rounded border bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button onClick={() => setDark(!dark)} aria-label="Toggle theme" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        <button onClick={openRight} className="md:hidden p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Open details">
          <InfoIcon />
        </button>
      </div>
    </header>
  )
}

export default ChatHeader


