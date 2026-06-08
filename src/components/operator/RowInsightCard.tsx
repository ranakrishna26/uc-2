import type { Cell } from '../../data/placeholderNetwork'
import { IssueTrailIcons } from './IssueTrailIcons'
import type { ImpactRowAiExplainInput } from './impactRowExplain'
import { formatImpactRowRankPhrase } from './impactRowExplain'

type Props = {
  detail: ImpactRowAiExplainInput
  filterSummary: string
  cell: Cell | null
}

function listModeLabel(mode: ImpactRowAiExplainInput['listMode']): string {
  return mode === 'impacted-subscribers' ? 'Impacted-subscriber volume' : 'Worst-cell KPI blend'
}

function filterItems(summary: string): string[] {
  return summary
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
}

function trailBullets(detail: ImpactRowAiExplainInput): { key: string; text: string }[] {
  const { flags } = detail
  const out: { key: string; text: string }[] = []
  if (flags.vip) {
    out.push({
      key: 'vip',
      text: 'Confirm premium mix in this cohort before customer-facing messaging; cross-check tariff and segment filters.',
    })
  }
  if (flags.issueConnectivity) {
    out.push({
      key: 'conn',
      text: 'Treat attach / NR-RRC / SA–NSA edge first: trace failures against core policy, DNS, and SIM profile for anchored subs.',
    })
  }
  if (flags.issueReliability) {
    out.push({
      key: 'rel',
      text: 'Audit mobility: neighbor relations, HO margins, RLF counters, and recent CM on Xn/S1 paths for this site ring.',
    })
  }
  if (flags.issueSignal) {
    out.push({
      key: 'sig',
      text: 'Validate RF: RSRP/RSRQ/BLER vs tilt/azimuth, overshoot, and indoor penetration for the serving footprint.',
    })
  }
  if (flags.issueThroughput) {
    out.push({
      key: 'tp',
      text: 'Separate capacity vs RF vs transport: correlate PRB, scheduler, and backhaul with DL/UL stress on this lens.',
    })
  }
  return out
}

function cellHypothesis(cell: Cell, detail: ImpactRowAiExplainInput): string {
  const { flags } = detail
  const s = cell.setupAccessFailures
  const c = cell.callDrops
  if (s === 0 && c === 0) {
    return 'Cell-level setup/access and drops are both zero—lean on the cohort lens and footprint anchoring; the stress is likely subscriber-sliced or outside this aggregate snapshot.'
  }
  if (s > c * 1.5 && s >= 3) {
    const tail =
      flags.issueConnectivity || flags.issueReliability
        ? 'Matches lit connectivity/reliability trail—prioritize RRC/attach traces and retainability in that order before RF-only changes.'
        : 'Even without connectivity icons, the imbalance suggests attach-side investigation before blaming RF.'
    return `Setup/access failures (${s}) dominate drops (${c}) on the cell record. ${tail}`
  }
  if (c > s * 1.5 && c >= 3) {
    const tail = flags.issueReliability
      ? 'Aligns with reliability trail—focus HO/RLF and neighbor audits with recent alarms.'
      : 'Drive retainability and session continuity checks even if reliability icons are not lit.'
    return `Call drops (${c}) lead setup/access failures (${s}). ${tail}`
  }
  if (flags.issueThroughput && flags.issueSignal && !flags.issueConnectivity) {
    return `Throughput and signal trails are lit with comparable failures (${s} setup/access, ${c} drops)—test for capacity-limited RF (congestion + weak coverage) on ${cell.band} before core-only escalation.`
  }
  return `Failures (${s} setup/access, ${c} drops) are comparable—tie ${detail.impactLensLabel} lens KPIs to neighbor HO/RF on ${cell.band} before locking a single root cause.`
}

function nextSteps(detail: ImpactRowAiExplainInput, cell: Cell | null): string[] {
  const steps: string[] = []
  const neighborHint =
    cell && cell.neighborIds.length
      ? `Compare against ${cell.neighborIds.length} mapped neighbor(s) on ${cell.band}.`
      : 'Compare immediate neighbors on the map for the same band cluster.'
  steps.push(`Select this cell on the map and ${neighborHint}`)

  if (detail.flags.issueConnectivity || cell?.setupAccessFailures) {
    steps.push(
      `Pull RRC/attach and policy events for site ${cell?.siteCode ?? detail.cellId} in the active time window; correlate with setup/access (${cell?.setupAccessFailures ?? 'n/a'} on record).`,
    )
  } else if (detail.flags.issueReliability || (cell && cell.callDrops > 0)) {
    steps.push(
      `Drill HO/RLF and alarm history for site ${cell?.siteCode ?? detail.cellId}; cell record shows ${cell?.callDrops ?? 'n/a'} drops vs ${cell?.setupAccessFailures ?? 'n/a'} setup/access failures.`,
    )
  } else {
    steps.push(
      `Open subscriber/session drill for anchors on ${detail.cellName} and validate the “${detail.impactLensLabel}” lens against session KPI bands.`,
    )
  }

  if (detail.total > 0 && detail.affected / detail.total > 0.35) {
    steps.push(
      `High impacted share (${Math.round((100 * detail.affected) / detail.total)}% of ${detail.total.toLocaleString()} in view)—package counts, trail icons, and default KPIs for a single ticket payload.`,
    )
  } else if (detail.total === 0 || !detail.fromAnchors) {
    steps.push(
      detail.total === 0
        ? 'Cohort is empty under current filters—widen time/geo or relax subscriber filters before acting on this row alone.'
        : 'Footprint anchoring is thin (fromAnchors=false)—expand scope or wait for a denser anchor set before hard prioritization.',
    )
  } else {
    steps.push(
      `Cross-check CM/transport changes for ${cell?.siteCode ?? 'this site'} against the active time window; attach diffs to the escalation note.`,
    )
  }

  return steps.slice(0, 4)
}

export function RowInsightCard({ detail, filterSummary, cell }: Props) {
  const sharePct = detail.total > 0 ? Math.round((100 * detail.affected) / detail.total) : 0
  const trails = trailBullets(detail)
  const filters = filterItems(filterSummary)

  return (
    <section className="row-insight-card" aria-labelledby={`row-insight-title-${detail.cellId}`}>
      <header className="row-insight-card__header">
        <h3 className="row-insight-card__title" id={`row-insight-title-${detail.cellId}`}>
          Impact row
        </h3>
        <p className="row-insight-card__subtitle">
          <span className="row-insight-card__cell-name">{detail.cellName}</span>
          <span className="row-insight-card__sep" aria-hidden>
            ·
          </span>
          <span className="mono row-insight-card__cell-id">{detail.cellId}</span>
        </p>
      </header>

      <div className="row-insight-card__section">
        <h4 className="row-insight-card__heading">At a glance</h4>
        <dl className="row-insight-card__stats">
          <div className="row-insight-card__stat-row">
            <dt>Impacted</dt>
            <dd className="mono">{detail.affected.toLocaleString()}</dd>
          </div>
          <div className="row-insight-card__stat-row">
            <dt>In cohort</dt>
            <dd className="mono">{detail.total.toLocaleString()}</dd>
          </div>
          <div className="row-insight-card__stat-row">
            <dt>Share</dt>
            <dd className="mono">{detail.total > 0 ? `${sharePct}%` : '—'}</dd>
          </div>
        </dl>
        {detail.total > 0 ? (
          <div
            className="row-insight-card__share-bar"
            role="img"
            aria-label={`Impacted share ${sharePct} percent`}
          >
            <div className="row-insight-card__share-bar-fill" style={{ width: `${sharePct}%` }} />
          </div>
        ) : (
          <p className="row-insight-card__muted">No subscribers in cohort after filters.</p>
        )}
      </div>

      <div className="row-insight-card__section row-insight-card__section--inline">
        <h4 className="row-insight-card__heading">View</h4>
        <div className="row-insight-card__chips" aria-label="Lens and list mode">
          <span className="row-insight-card__chip">Lens: {detail.impactLensLabel}</span>
          <span className="row-insight-card__chip">{listModeLabel(detail.listMode)}</span>
        </div>
      </div>

      <div className="row-insight-card__section">
        <h4 className="row-insight-card__heading">Active filters</h4>
        <ul className="row-insight-card__filter-list">
          {filters.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="row-insight-card__section">
        <h4 className="row-insight-card__heading">Issue trail</h4>
        <div className="row-insight-card__trail-row">
          <IssueTrailIcons flags={detail.flags} aggregateScope="cell" className="row-insight-card__trail-icons" />
        </div>
        {trails.length > 0 ? (
          <ul className="row-insight-card__trail-bullets">
            {trails.map((t) => (
              <li key={t.key}>{t.text}</li>
            ))}
          </ul>
        ) : (
          <p className="row-insight-card__muted">
            No trail icons lit—still verify the lens cohort; absence here does not clear the site if impacted count is
            high.
          </p>
        )}
      </div>

      {cell ? (
        <div className="row-insight-card__section">
          <h4 className="row-insight-card__heading">Cell snapshot</h4>
          <div className="row-insight-card__fact-grid">
            <span className="row-insight-card__fact-label">Vendor</span>
            <span>{cell.vendor}</span>
            <span className="row-insight-card__fact-label">Site / sector</span>
            <span>
              {cell.siteCode} · {cell.sector}
            </span>
            <span className="row-insight-card__fact-label">Band</span>
            <span>
              {cell.band} ({cell.bandwidthMhz} MHz)
            </span>
            <span className="row-insight-card__fact-label">PCI / TAC</span>
            <span className="mono">
              {cell.pci} / {cell.tac}
            </span>
            <span className="row-insight-card__fact-label">Setup / access</span>
            <span className="mono">{cell.setupAccessFailures}</span>
            <span className="row-insight-card__fact-label">Call drops</span>
            <span className="mono">{cell.callDrops}</span>
            <span className="row-insight-card__fact-label">DL / UL</span>
            <span className="mono">
              {cell.dlMbps} / {cell.ulMbps} Mbps
            </span>
            <span className="row-insight-card__fact-label">HO success</span>
            <span className="mono">{cell.hoSuccessPct.toFixed(1)}%</span>
          </div>
          <p className="row-insight-card__hypothesis">
            <strong>Hypothesis.</strong> {cellHypothesis(cell, detail)}
          </p>
        </div>
      ) : null}

      <div className="row-insight-card__section">
        <h4 className="row-insight-card__heading">Rank</h4>
        <p className="row-insight-card__rank-line">{formatImpactRowRankPhrase(detail)}</p>
      </div>

      <div className="row-insight-card__section">
        <h4 className="row-insight-card__heading">Next steps</h4>
        <ol className="row-insight-card__steps">
          {nextSteps(detail, cell).map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="row-insight-card__section row-insight-card__section--foot">
        <p className="row-insight-card__footnote">
          Environment label <span className="mono">{detail.environment}</span> is deterministic from the prototype model.
        </p>
        {!detail.fromAnchors ? (
          <p className="row-insight-card__footnote row-insight-card__footnote--warn">
            Footprint anchoring is thin for this slice—treat rank and share as directional until anchors densify.
          </p>
        ) : null}
      </div>
    </section>
  )
}
