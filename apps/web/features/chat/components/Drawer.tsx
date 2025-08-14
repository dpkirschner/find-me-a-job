import React, { useEffect } from 'react'
import classNames from '../../../lib/classNames'

export interface DrawerProps {
  children: React.ReactNode
  onClose: () => void
  side?: 'left' | 'right'
}

export function Drawer({ children, onClose, side = 'left' }: DrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={classNames(
          'absolute top-0 h-full w-80 bg-white dark:bg-gray-900 shadow-xl transition-transform',
          side === 'left' ? 'left-0' : 'right-0'
        )}
      >
        {children}
      </div>
    </div>
  )
}

export default Drawer


