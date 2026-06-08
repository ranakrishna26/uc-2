import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

export type AiChatMessage =
  | { id: string; role: 'user'; type: 'text'; body: string; source?: 'map-click' }
  | { id: string; role: 'assistant'; type: 'text'; body: string; source?: 'map-click' }
  | {
      id: string
      role: 'assistant'
      type: 'rich'
      body: string
      diagram: ReactNode
      source?: 'map-click'
    }
  | {
      id: string
      role: 'assistant'
      type: 'structured'
      body: ReactNode
      source?: 'map-click'
    }

type OpenWithContextBase = {
  userText?: string
  replaceMapInsight?: boolean
  source?: 'map-click'
}

/** Exactly one of diagram, structured body, or plain assistant text. */
export type OpenWithContextOpts =
  | (OpenWithContextBase & { assistantDiagram: ReactNode; assistantText?: string })
  | (OpenWithContextBase & { assistantBody: ReactNode })
  | (OpenWithContextBase & { assistantText: string })

export type AiChatDockProps = {
  /** Optional hook when the user sends a message (after trim); demo still updates local state. */
  onSend?: (message: string) => void
}

export type AiChatDockHandle = {
  /** Shows loading state in the open panel (map insight path). */
  setInsightLoading: (loading: boolean) => void
  /** Opens the panel (expanded), optionally prepends a user line, then appends an assistant message. */
  openWithContext: (opts: OpenWithContextOpts) => void
}

function newMessageId(prefix: string): string {
  const c = globalThis.crypto?.randomUUID?.()
  if (c) return `${prefix}-${c}`
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function IconSparkle({ className }: { className?: string }) {
  return (
    <svg className={className} width="15" height="15" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
      />
    </svg>
  )
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
    </svg>
  )
}

function IconHistory({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 8v4l2.5 1.5M21 12a9 9 0 11-9-9c2.5 0 4.8 1 6.4 2.6L21 8"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconBell({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 22a2 2 0 002-2H10a2 2 0 002 2zm6-6V11a6 6 0 10-12 0v5l-2 2h16l-2-2z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
      />
    </svg>
  )
}

/** Taller message area */
function IconExpandPanel({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 3H4v5M15 3h5v5M15 21h5v-5M9 21H4v-5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Shorter message area */
function IconCompressPanel({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 9V4h5M20 9V4h-5M20 15v5h-5M4 15v5h5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const AiChatDock = forwardRef<AiChatDockHandle, AiChatDockProps>(function AiChatDock({ onSend }, ref) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [insightLoading, setInsightLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const barInputRef = useRef<HTMLInputElement>(null)
  const panelId = useId()

  useImperativeHandle(
    ref,
    () => ({
      setInsightLoading(loading: boolean) {
        setInsightLoading(loading)
        if (loading) {
          setIsOpen(true)
          setIsExpanded(true)
        }
      },
      openWithContext(opts) {
        const { userText, replaceMapInsight = true, source } = opts
        setInsightLoading(false)
        const trimmedUser = userText?.trim()
        const tag = source === 'map-click' ? 'map-click' : undefined
        setIsOpen(true)
        setIsExpanded(true)
        setMessages((prev) => {
          const next =
            replaceMapInsight && tag === 'map-click'
              ? prev.filter((m) => !('source' in m && m.source === 'map-click'))
              : [...prev]
          if (trimmedUser) {
            next.push({
              id: newMessageId('u'),
              role: 'user',
              type: 'text',
              body: trimmedUser,
              ...(tag ? { source: tag } : {}),
            })
          }
          if ('assistantDiagram' in opts && opts.assistantDiagram != null) {
            next.push({
              id: newMessageId('a'),
              role: 'assistant',
              type: 'rich',
              body: opts.assistantText ?? '',
              diagram: opts.assistantDiagram,
              ...(tag ? { source: tag } : {}),
            })
          } else if ('assistantBody' in opts) {
            next.push({
              id: newMessageId('a'),
              role: 'assistant',
              type: 'structured',
              body: opts.assistantBody,
              ...(tag ? { source: tag } : {}),
            })
          } else {
            next.push({
              id: newMessageId('a'),
              role: 'assistant',
              type: 'text',
              body: opts.assistantText ?? '',
              ...(tag ? { source: tag } : {}),
            })
          }
          return next
        })
        window.setTimeout(() => {
          barInputRef.current?.focus()
        }, 0)
      },
    }),
    [],
  )

  useEffect(() => {
    if (!isOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setIsExpanded(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
        setIsExpanded(false)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const t = window.setTimeout(() => barInputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [isOpen])

  const handleSend = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    if (insightLoading) return
    onSend?.(text)
    const userId = `u-${Date.now()}`
    setIsOpen(true)
    setMessages((prev) => [...prev, { id: userId, role: 'user', type: 'text', body: text }])
    setDraft('')
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          type: 'text',
          body: 'Demo reply: connect a model here to answer from your network context.',
        },
      ])
    }, 550)
  }, [draft, onSend, insightLoading])

  return (
    <div className="ai-chat-dock" ref={rootRef}>
      {isOpen ? (
        <section
          id={panelId}
          className={`ai-chat-panel${isExpanded ? ' ai-chat-panel--expanded' : ''}`}
          role="region"
          aria-labelledby="ai-chat-panel-title"
        >
          <header className="ai-chat-panel__header">
            <h2 className="ai-chat-panel__title" id="ai-chat-panel-title">
              Assistant
            </h2>
            <div className="ai-chat-panel__header-actions">
              <button
                type="button"
                className="ai-chat-panel__icon-btn"
                onClick={() => setIsExpanded((v) => !v)}
                aria-pressed={isExpanded}
                aria-label={isExpanded ? 'Use shorter assistant panel' : 'Use taller assistant panel'}
              >
                {isExpanded ? <IconCompressPanel /> : <IconExpandPanel />}
              </button>
              <button
                type="button"
                className="ai-chat-panel__icon-btn"
                onClick={() => {
                  setIsOpen(false)
                  setIsExpanded(false)
                }}
                aria-label="Close assistant panel"
              >
                <IconClose />
              </button>
            </div>
          </header>
          <div
            className="ai-chat-panel__messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {insightLoading ? (
              <p className="ai-chat-panel__loading" role="status">
                Loading cell insight…
              </p>
            ) : null}
            {messages.length === 0 && !insightLoading ? (
              <p className="ai-chat-panel__empty">No messages yet. Ask anything to try the demo.</p>
            ) : (
              <ul className="ai-chat-panel__message-list">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`ai-chat-bubble ai-chat-bubble--${m.role}${
                      m.role === 'assistant' && m.type === 'rich' ? ' ai-chat-bubble--rich' : ''
                    }${m.role === 'assistant' && m.type === 'structured' ? ' ai-chat-bubble--structured' : ''}`}
                  >
                    {m.role === 'assistant' && m.type === 'rich' ? (
                      <div className="ai-chat-bubble__rich">
                        <p className="ai-chat-bubble__rich-text">
                          {m.body.split('\n').map((line, i) => (
                            <Fragment key={`${m.id}-ln-${i}`}>
                              {i > 0 ? <br /> : null}
                              {line}
                            </Fragment>
                          ))}
                        </p>
                        {m.diagram}
                      </div>
                    ) : m.role === 'assistant' && m.type === 'structured' ? (
                      <div className="ai-chat-bubble__structured">{m.body}</div>
                    ) : (
                      m.body
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      <div className="ai-chat-bar" role="search" aria-label="Ask the assistant">
        <button
          type="button"
          className="ai-chat-bar__sparkle"
          aria-label="Assistant options"
          aria-haspopup="true"
          aria-expanded={false}
        >
          <IconSparkle />
          <IconChevronDown className="ai-chat-bar__sparkle-chevron" />
        </button>

        <input
          ref={barInputRef}
          type="search"
          className="ai-chat-dock__input ai-chat-bar__input"
          placeholder="Ask anything"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSend()
            }
          }}
          aria-label="Ask the assistant; press Enter to send"
        />

        <div className="ai-chat-bar__actions" role="group" aria-label="Assistant shortcuts">
          <button type="button" className="ai-chat-bar__icon-btn" aria-label="History (coming soon)">
            <IconHistory />
          </button>
          <button type="button" className="ai-chat-bar__icon-btn" aria-label="Notifications (coming soon)">
            <IconBell />
          </button>
        </div>
      </div>
    </div>
  )
})

AiChatDock.displayName = 'AiChatDock'
