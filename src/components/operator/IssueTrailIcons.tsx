import type { CellImpactRankingFlags } from '../../data/placeholderNetwork'

export function IconConnectivity({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M3 12h2v-2H3v2zm4 0h2V8H7v4zm4 0h2V4h-2v8zm4 0h2V7h-2v5zm4 0h2v-4h-2v4z"
      />
    </svg>
  )
}

export function IconReliability({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6 4h8c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 2v12h8V6H6zm10 1h4v10h-4V7zm1 2v6h2V9h-2z"
      />
    </svg>
  )
}

export function IconSignal({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M2 18h3v4H2v-4zm5-4h3v8H7v-8zm5-6h3v14h-3V8zm5-5h3v19h-3V3z" />
    </svg>
  )
}

export function IconThroughput({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 4l-4 5h3v11h2V9h3l-4-5zm-6 7H4v9h2v-9zm14 3h-2v6h2v-6z"
      />
    </svg>
  )
}

const TITLES: Record<'cell' | 'subscriber', { connectivity: string; reliability: string; signal: string; throughput: string }> = {
  cell: {
    connectivity: 'Connectivity KPIs off target (cell aggregate)',
    reliability: 'Reliability KPIs off target (cell aggregate)',
    signal: 'RF / signal quality off target (cell aggregate)',
    throughput: 'Throughput off target (cell aggregate)',
  },
  subscriber: {
    connectivity: 'Connectivity KPIs off target for this subscriber',
    reliability: 'Reliability KPIs off target for this subscriber',
    signal: 'RF / signal quality off target for this subscriber',
    throughput: 'Throughput off target for this subscriber',
  },
}

type Props = {
  flags: CellImpactRankingFlags
  /** Wording for icon tooltips */
  aggregateScope?: 'cell' | 'subscriber'
  className?: string
}

export function IssueTrailIcons({ flags, aggregateScope = 'cell', className }: Props) {
  const t = TITLES[aggregateScope]
  return (
    <span className={`impact-row__trail-icons${className ? ` ${className}` : ''}`} aria-hidden>
      {flags.vip ? <span className="impact-chip impact-chip--vip">VIP</span> : null}
      {flags.issueConnectivity ? (
        <span className="impact-trail-icon" title={t.connectivity}>
          <IconConnectivity />
        </span>
      ) : null}
      {flags.issueReliability ? (
        <span className="impact-trail-icon" title={t.reliability}>
          <IconReliability />
        </span>
      ) : null}
      {flags.issueSignal ? (
        <span className="impact-trail-icon" title={t.signal}>
          <IconSignal />
        </span>
      ) : null}
      {flags.issueThroughput ? (
        <span className="impact-trail-icon" title={t.throughput}>
          <IconThroughput />
        </span>
      ) : null}
    </span>
  )
}
