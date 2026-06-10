import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// Reusable wrapper for every Daily Summary section. Numbered, collapsible
// header (click to toggle) + the shared `.card-bg` card chrome. Each
// section manages its own open state and defaults to expanded.
//
// Adding a future section = one new component rendered inside a
// <SectionShell> + one line in DailyBrief.jsx. No refactor.
export function SectionShell({ index, title, meta, children, className = '' }) {
  const [open, setOpen] = useState(true)
  return (
    <section className={`db-section db-scrim${className ? ` ${className}` : ''}`}>
      <div className="card-bg" aria-hidden="true" />
      <button
        type="button"
        className="db-section-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="db-section-title">
          {index != null && <span className="db-section-index">{index}</span>}
          <h2>{title}</h2>
        </div>
        {meta != null && <div className="db-section-meta">{meta}</div>}
        <span
          className={`db-section-chev${open ? ' db-section-chev-open' : ''}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden', position: 'relative', zIndex: 1 }}
          >
            <div className="db-section-body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
