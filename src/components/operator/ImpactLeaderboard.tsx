import { useEffect, useId, useRef, useState } from 'react'
import {
  cellEnvironmentLabel,
  type Cell,
  type CellLeaderboardFlags,
  type LeaderboardImpactLens,
} from '../../data/placeholderNetwork'
import { IconSparkle } from './AiChatDock'
import {
  IconConnectivity,
  IconReliability,
  IconSignal,
  IconThroughput,
  IssueTrailIcons,
} from './IssueTrailIcons'

import type { LeaderboardAiExplainInput } from './leaderboardAiExplain'

export type LeaderboardListMode = 'impacted-subscribers' | 'worst-cells'

export type ImpactLeaderboardRow = {
  cell: Cell
  affected: number
  total: number
  fromAnchors: boolean
  flags: CellLeaderboardFlags
  /** Set in worst-cells mode: lens KPI line for sorting context (composite or single KPI). */
  worstMetricLine?: string | null
}

export type ImpactLeaderboardAiExplainDetail = LeaderboardAiExplainInput

const IMPACT_OPTIONS: { id: LeaderboardImpactLens; label: string }[] = [
  { id: 'All', label: 'All' },
  { id: 'Connectivity', label: 'Connectivity' },
  { id: 'Reliability', label: 'Reliability' },
  { id: 'Signal', label: 'Signal' },
  { id: 'Throughput', label: 'Throughput' },
]

function severityDotClass(rank: number, listLen: number): string {
  if (listLen <= 0) return 'impact-row__dot--muted'
  const t = rank / Math.max(listLen - 1, 1)
  if (t <= 0.2) return 'impact-row__dot--critical'
  if (t <= 0.45) return 'impact-row__dot--high'
  if (t <= 0.7) return 'impact-row__dot--medium'
  if (t <= 0.88) return 'impact-row__dot--low'
  return 'impact-row__dot--ok'
}

function IconCellTower({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M11 2h2v3h3v2h-2v15h-2V7H10V5h3V2h-2zm-5 8h2v12H6V10zm14 4h2v8h-2v-8zM2 14h2v8H2v-8z"
      />
    </svg>
  )
}

function IconPeople({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
      />
    </svg>
  )
}

function impactIcon(id: Exclude<LeaderboardImpactLens, 'All'>) {
  switch (id) {
    case 'Connectivity':
      return <IconConnectivity />
    case 'Reliability':
      return <IconReliability />
    case 'Signal':
      return <IconSignal />
    case 'Throughput':
      return <IconThroughput />
  }
}

function impactLensExplainLabel(lens: LeaderboardImpactLens): string {
  return lens === 'All'
    ? 'All impact types (connectivity, reliability, signal, or throughput)'
    : lens
}

function impactLensRowAriaImpactedBy(lens: LeaderboardImpactLens): string {
  if (lens === 'All') {
    return 'any impact type: connectivity, reliability, signal, or throughput'
  }
  return lens
}

function rowSelectAriaLabel(
  row: ImpactLeaderboardRow,
  listMode: LeaderboardListMode,
  impactType: LeaderboardImpactLens,
  rank: number,
  listLen: number,
): string {
  const env = cellEnvironmentLabel(row.cell)
  if (listMode === 'impacted-subscribers') {
    return `${row.cell.name}, ${row.affected.toLocaleString()} subscribers impacted by ${impactLensRowAriaImpactedBy(impactType)} of ${row.total.toLocaleString()} total in cell footprint. Row icons show which dimensions have stress in this cohort.`
  }
  const metric = row.worstMetricLine?.trim() || 'composite KPI stress across pillars'
  return `${row.cell.name}, cell ${row.cell.id}. Rank ${rank + 1} of ${listLen} by ${impactType === 'All' ? 'mean KPI rank' : `${impactType} stress`}: ${metric}. Footprint: ${row.affected.toLocaleString()} impacted subscribers, ${row.total.toLocaleString()} total (${env}). Row icons show pillar stress.`
}

type Props = {
  listMode: LeaderboardListMode
  onListMode: (m: LeaderboardListMode) => void
  impactType: LeaderboardImpactLens
  onImpactType: (t: LeaderboardImpactLens) => void
  search: string
  onSearch: (q: string) => void
  rows: ImpactLeaderboardRow[]
  onSelectCell: (cellId: string) => void
  onAiExplainRow?: (detail: ImpactLeaderboardAiExplainDetail) => void
}

export function ImpactLeaderboard({
  listMode,
  onListMode,
  impactType,
  onImpactType,
  search,
  onSearch,
  rows,
  onSelectCell,
  onAiExplainRow,
}: Props) {
  const menuId = useId()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const listAria =
    listMode === 'impacted-subscribers'
      ? impactType === 'All'
        ? 'Cells ranked by count of subscribers impacted for any impact type'
        : `Cells ranked by count of subscribers impacted for ${impactType}`
      : impactType === 'All'
        ? 'Cells ranked by average worst rank across connectivity, reliability, signal, and throughput'
        : `Cells ranked by ${impactType} KPI stress`

  return (
    <div className="impact-leaderboard">
      <label className="impact-leaderboard__search">
        <span className="impact-leaderboard__search-icon" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
        </span>
        <input
          type="search"
          placeholder={
            listMode === 'worst-cells' ? 'Search cell name or ID' : 'Search cells, ID, or IMSI'
          }
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label={
            listMode === 'worst-cells'
              ? 'Filter the leaderboard by cell name or cell ID'
              : 'Filter cells by name or ID, or type a subscriber IMSI to match below'
          }
        />
      </label>

      <div className="impact-leaderboard__toolbar">
        <div className="impact-leaderboard__view-switch" role="tablist" aria-label="Leaderboard view">
          <button
            type="button"
            role="tab"
            aria-selected={listMode === 'impacted-subscribers'}
            className={`impact-leaderboard__segment${listMode === 'impacted-subscribers' ? ' is-active' : ''}`}
            onClick={() => onListMode('impacted-subscribers')}
          >
            <IconPeople className="impact-leaderboard__tab-icon" />
            Impacted subscribers
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listMode === 'worst-cells'}
            className={`impact-leaderboard__segment${listMode === 'worst-cells' ? ' is-active' : ''}`}
            onClick={() => onListMode('worst-cells')}
          >
            <IconCellTower className="impact-leaderboard__tab-icon" />
            Worst cells
          </button>
        </div>

        <div className="impact-leaderboard__impact-wrap" ref={menuRef}>
          <button
            type="button"
            className="impact-leaderboard__impact-btn"
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            aria-controls={menuId}
            aria-label={`Impact type: ${impactLensExplainLabel(impactType)}`}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {impactType !== 'All' ? (
              <span className="impact-leaderboard__impact-btn-lens" aria-hidden>
                {impactIcon(impactType)}
              </span>
            ) : null}
            <span className="impact-leaderboard__impact-btn-label">{IMPACT_OPTIONS.find((o) => o.id === impactType)?.label ?? impactType}</span>
            <span className="impact-leaderboard__chevron" aria-hidden>
              ▾
            </span>
          </button>
          {menuOpen ? (
            <div id={menuId} className="impact-leaderboard__menu" role="listbox" aria-label="Impact type">
              {IMPACT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={impactType === opt.id}
                  className={impactType === opt.id ? 'is-selected' : ''}
                  onClick={() => {
                    onImpactType(opt.id)
                    setMenuOpen(false)
                  }}
                >
                  <span
                    className={`impact-leaderboard__menu-icon${opt.id === 'All' ? ' impact-leaderboard__menu-icon--no-icon' : ''}`}
                    aria-hidden
                  >
                    {opt.id === 'All' ? null : impactIcon(opt.id)}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <ul className="impact-leaderboard__list" aria-label={listAria}>
        {rows.map((row, rank) => (
          <li key={row.cell.id}>
            <div className="impact-row">
              <button
                type="button"
                className="impact-row__select"
                onClick={() => onSelectCell(row.cell.id)}
                aria-label={rowSelectAriaLabel(row, listMode, impactType, rank, rows.length)}
              >
                <span className={`impact-row__dot ${severityDotClass(rank, rows.length)}`} aria-hidden />
                <span className="impact-row__main">
                  {listMode === 'impacted-subscribers' ? (
                    <>
                      <span className="impact-row__primary">{row.affected.toLocaleString()}</span>
                      <span className="impact-row__sub">
                        <span>{cellEnvironmentLabel(row.cell)}</span>
                        <span className="impact-row__sep">|</span>
                        <span>{row.total.toLocaleString()}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="impact-row__primary impact-row__primary--cell">
                        <span className="impact-row__cell-name">{row.cell.name}</span>
                        <span className="impact-row__cell-id mono">{row.cell.id}</span>
                      </span>
                      <span className="impact-row__sub">
                        {row.worstMetricLine ? <span className="impact-row__metric">{row.worstMetricLine}</span> : null}
                        {row.worstMetricLine ? <span className="impact-row__sep">|</span> : null}
                        <span>{cellEnvironmentLabel(row.cell)}</span>
                        <span className="impact-row__sep">|</span>
                        <span>
                          {row.affected.toLocaleString()} impacted / {row.total.toLocaleString()} subs
                        </span>
                      </span>
                    </>
                  )}
                </span>
              </button>
              <span className="impact-row__trail">
                {onAiExplainRow ? (
                  <button
                    type="button"
                    className="impact-row__ai"
                    aria-label="Explain this row with assistant"
                    onClick={(e) => {
                      e.stopPropagation()
                      onAiExplainRow({
                        cellId: row.cell.id,
                        cellName: row.cell.name,
                        affected: row.affected,
                        total: row.total,
                        fromAnchors: row.fromAnchors,
                        environment: cellEnvironmentLabel(row.cell),
                        impactLensLabel: impactLensExplainLabel(impactType),
                        listMode,
                        flags: row.flags,
                        rankIndex: rank,
                        rankTotal: rows.length,
                      })
                    }}
                  >
                    <IconSparkle className="impact-row__ai-sparkle" />
                  </button>
                ) : null}
                <IssueTrailIcons flags={row.flags} aggregateScope="cell" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
