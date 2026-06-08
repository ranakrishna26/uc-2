/**
 * Map cell → AI insight: degradation inference, copy, diagrams, and async fetch stub.
 */

/* eslint-disable react-refresh/only-export-components -- module exports helpers + fetch alongside diagram components */

import type { ReactNode } from 'react'
import {
  cellKpiValue,
  kpiBand,
  type Cell,
  type ImpactType,
  type ImpactRankingLens,
  type SubscriberGlobalFilters,
} from '../../data/placeholderNetwork'
import { KPI_BY_ID, formatKpiValueByDefinition, type KpiId } from '../../data/kpis'

export type DegradationFocus = ImpactType | 'mixed'

const PILLAR_KPIS: Record<ImpactType, readonly KpiId[]> = {
  Connectivity: ['connectivity_attach_success_pct', 'connectivity_nr_rrc_setup_success_pct'],
  Reliability: ['reliability_rlf_count', 'reliability_5g_ho_success_pct'],
  Signal: ['signal_rsrp', 'signal_rsrq'],
  Throughput: ['throughput_dl_mbps', 'throughput_ul_mbps'],
}

const MIXED_FOOTPRINT_KPIS: { kpiId: KpiId; label: string; fillClass: string }[] = [
  { kpiId: 'signal_rsrp', label: 'Signal', fillClass: 'ai-chat-diagram__fill--signal' },
  { kpiId: 'throughput_dl_mbps', label: 'Throughput', fillClass: 'ai-chat-diagram__fill--throughput' },
  { kpiId: 'reliability_5g_ho_success_pct', label: 'Reliability', fillClass: 'ai-chat-diagram__fill--reliability' },
  { kpiId: 'connectivity_attach_success_pct', label: 'Connectivity', fillClass: 'ai-chat-diagram__fill--connectivity' },
]

/** Map raw KPI value to a 0–100 bar width (health) for compact charts. */
export function kpiFootprintScorePct(kpiId: KpiId, value: number): number {
  const def = KPI_BY_ID[kpiId]
  const th = def.thresholds
  if (!th) return 52
  const { good, warning } = th
  if (def.direction === 'higher_is_better') {
    if (value >= good) return 100
    if (value >= warning) {
      const span = good - warning
      if (Math.abs(span) < 1e-9) return 68
      return Math.round(32 + (68 * (value - warning)) / span)
    }
    const spanBelow = Math.max(Math.abs(good - warning), 1e-3)
    const badFloor = warning - spanBelow * 1.5
    if (value <= badFloor) return 6
    return Math.round(6 + (26 * (value - badFloor)) / (warning - badFloor))
  }
  if (value <= good) return 100
  if (value <= warning) {
    const span = warning - good
    if (Math.abs(span) < 1e-9) return 68
    return Math.round(32 + (68 * (warning - value)) / span)
  }
  const spanAbove = Math.max(Math.abs(warning - good), 1e-3)
  const badCeiling = warning + spanAbove * 1.5
  if (value >= badCeiling) return 6
  return Math.round(6 + (26 * (badCeiling - value)) / (badCeiling - warning))
}

function pillarBadness(cell: Cell, filters: SubscriberGlobalFilters, pillar: ImpactType): number {
  const ids = PILLAR_KPIS[pillar]
  let sum = 0
  for (const id of ids) {
    const v = cellKpiValue(cell, filters, id)
    const band = kpiBand(id, v)
    sum += band === 'breached' ? 3 : band === 'nearBreach' ? 1.2 : 0
  }
  return sum / ids.length
}

/**
 * Infer which degradation family is dominant from KPI bands; falls back to `lensImpactType`
 * when all pillars look healthy (demo noise floor).
 */
export function inferCellDegradationFocus(
  cell: Cell,
  filters: SubscriberGlobalFilters,
  lensImpactType: ImpactRankingLens,
): DegradationFocus {
  const scores = (['Connectivity', 'Reliability', 'Signal', 'Throughput'] as const).map((p) => ({
    pillar: p,
    s: pillarBadness(cell, filters, p),
  }))
  const maxS = Math.max(...scores.map((x) => x.s))
  if (maxS < 0.45) {
    return lensImpactType === 'All' ? 'mixed' : lensImpactType
  }
  const top = scores.filter((x) => x.s >= maxS - 0.35 && x.s > 0)
  if (top.length >= 2) return 'mixed'
  const winner = scores.reduce((a, b) => (b.s > a.s ? b : a))
  return winner.pillar
}

function bandLabel(kpiId: KpiId, value: number): string {
  const b = kpiBand(kpiId, value)
  if (b === 'breached') return 'breached'
  if (b === 'nearBreach') return 'near target'
  return 'meets target'
}

export function buildMapInsightUserText(cell: Cell, cellId: string): string {
  return `Summarize cell ${cell.name} (${cellId}).`
}

function mapInsightLensLabel(lens: ImpactRankingLens): string {
  return lens === 'All' ? 'All impact types' : lens
}

export function buildMapInsightAssistantText(
  cell: Cell,
  cellId: string,
  filters: SubscriberGlobalFilters,
  lensImpactType: ImpactRankingLens,
  focus: DegradationFocus,
  affected: number,
  total: number,
  environment: string,
): string {
  const lines: string[] = []
  lines.push(`**Primary stress:** ${focus === 'mixed' ? 'Multiple dimensions' : focus}`)
  lines.push('')
  lines.push(`Cell **${cell.name}** (\`${cellId}\`). Environment: **${environment}**.`)
  lines.push(
    `Footprint: **${affected.toLocaleString()}** impacted / **${total.toLocaleString()}** subscribers (current lens: **${mapInsightLensLabel(lensImpactType)}**).`,
  )
  if (lensImpactType === 'All') {
    if (focus !== 'mixed') {
      lines.push(`Across pillars, the strongest KPI stress here is **${focus}**.`)
    }
  } else if (focus !== lensImpactType && focus !== 'mixed') {
    lines.push(
      `Note: you have **${mapInsightLensLabel(lensImpactType)}** selected in filters; the strongest KPI stress here is **${focus}**.`,
    )
  }
  lines.push('')
  const mixedSampleKpis: KpiId[] = [
    'connectivity_attach_success_pct',
    'reliability_rlf_count',
    'signal_rsrp',
    'throughput_dl_mbps',
  ]
  const kpis: KpiId[] = focus === 'mixed' ? mixedSampleKpis : [...PILLAR_KPIS[focus]]
  if (focus === 'mixed') {
    lines.push('**Sample KPIs (mixed stress):**')
    for (const id of kpis.slice(0, 4)) {
      const v = cellKpiValue(cell, filters, id)
      const meta = KPI_BY_ID[id]
      lines.push(
        `- **${meta.label}:** ${formatKpiValueByDefinition(meta, v)} (${bandLabel(id, v)})`,
      )
    }
  } else {
    lines.push(`**${focus} metrics:**`)
    for (const id of PILLAR_KPIS[focus]) {
      const v = cellKpiValue(cell, filters, id)
      const meta = KPI_BY_ID[id]
      lines.push(
        `- **${meta.label}:** ${formatKpiValueByDefinition(meta, v)} (${bandLabel(id, v)})`,
      )
    }
  }
  lines.push('')
  lines.push('Use the impact ranking row to open the subscriber list; map picks stay in this assistant.')
  return lines.join('\n')
}

/** Strip simple `**bold**` for plain paragraph rendering in chat (first line kept as title in UI if needed). */
export function flattenAssistantMarkdownForChat(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1')
}

function KpiBarRow({
  kpiId,
  label,
  cell,
  filters,
  fillClass,
}: {
  kpiId: KpiId
  label: string
  cell: Cell
  filters: SubscriberGlobalFilters
  fillClass: string
}) {
  const raw = cellKpiValue(cell, filters, kpiId)
  const meta = KPI_BY_ID[kpiId]
  const pct = Math.min(100, Math.max(6, kpiFootprintScorePct(kpiId, raw)))
  const shown = formatKpiValueByDefinition(meta, raw)
  return (
    <div className="ai-chat-diagram__row">
      <span className="ai-chat-diagram__label">
        {label} <span className="ai-chat-diagram__value">({shown})</span>
      </span>
      <div className="ai-chat-diagram__bar" role="presentation">
        <div className={`ai-chat-diagram__fill ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function CellMixedFootprint({ cell, filters }: { cell: Cell; filters: SubscriberGlobalFilters }) {
  return (
    <figure className="ai-chat-diagram" aria-label="Multiple KPI dimensions relative health">
      <figcaption className="ai-chat-diagram__caption">Multiple dimensions stressed (relative health)</figcaption>
      {MIXED_FOOTPRINT_KPIS.map(({ kpiId, label, fillClass }) => (
        <KpiBarRow key={kpiId} kpiId={kpiId} label={label} cell={cell} filters={filters} fillClass={fillClass} />
      ))}
    </figure>
  )
}

function CellConnectivityInsight({ cell, filters }: { cell: Cell; filters: SubscriberGlobalFilters }) {
  return (
    <figure className="ai-chat-diagram" aria-label="Connectivity KPIs for selected cell">
      <figcaption className="ai-chat-diagram__caption">Connectivity stress</figcaption>
      <KpiBarRow
        kpiId="connectivity_attach_success_pct"
        label="Attach success"
        cell={cell}
        filters={filters}
        fillClass="ai-chat-diagram__fill--connectivity"
      />
      <KpiBarRow
        kpiId="connectivity_nr_rrc_setup_success_pct"
        label="NR RRC setup"
        cell={cell}
        filters={filters}
        fillClass="ai-chat-diagram__fill--connectivity"
      />
    </figure>
  )
}

function CellReliabilityInsight({ cell, filters }: { cell: Cell; filters: SubscriberGlobalFilters }) {
  return (
    <figure className="ai-chat-diagram" aria-label="Reliability KPIs for selected cell">
      <figcaption className="ai-chat-diagram__caption">Reliability stress</figcaption>
      <KpiBarRow
        kpiId="reliability_rlf_count"
        label="RLF load (proxy)"
        cell={cell}
        filters={filters}
        fillClass="ai-chat-diagram__fill--reliability"
      />
      <KpiBarRow
        kpiId="reliability_5g_ho_success_pct"
        label="5G HO success"
        cell={cell}
        filters={filters}
        fillClass="ai-chat-diagram__fill--reliability"
      />
    </figure>
  )
}

function CellSignalInsight({ cell, filters }: { cell: Cell; filters: SubscriberGlobalFilters }) {
  return (
    <figure className="ai-chat-diagram" aria-label="Signal KPIs for selected cell">
      <figcaption className="ai-chat-diagram__caption">RF / signal stress</figcaption>
      <KpiBarRow kpiId="signal_rsrp" label="RSRP" cell={cell} filters={filters} fillClass="ai-chat-diagram__fill--signal" />
      <KpiBarRow kpiId="signal_rsrq" label="RSRQ" cell={cell} filters={filters} fillClass="ai-chat-diagram__fill--signal" />
    </figure>
  )
}

function CellThroughputInsight({ cell, filters }: { cell: Cell; filters: SubscriberGlobalFilters }) {
  return (
    <figure className="ai-chat-diagram" aria-label="Throughput KPIs for selected cell">
      <figcaption className="ai-chat-diagram__caption">Throughput stress</figcaption>
      <KpiBarRow
        kpiId="throughput_dl_mbps"
        label="DL throughput"
        cell={cell}
        filters={filters}
        fillClass="ai-chat-diagram__fill--throughput"
      />
      <KpiBarRow
        kpiId="throughput_ul_mbps"
        label="UL throughput"
        cell={cell}
        filters={filters}
        fillClass="ai-chat-diagram__fill--throughput"
      />
    </figure>
  )
}

export function MapInsightPrimaryDiagram({
  cell,
  filters,
  focus,
}: {
  cell: Cell
  filters: SubscriberGlobalFilters
  focus: DegradationFocus
}) {
  switch (focus) {
    case 'Connectivity':
      return <CellConnectivityInsight cell={cell} filters={filters} />
    case 'Reliability':
      return <CellReliabilityInsight cell={cell} filters={filters} />
    case 'Signal':
      return <CellSignalInsight cell={cell} filters={filters} />
    case 'Throughput':
      return <CellThroughputInsight cell={cell} filters={filters} />
    default:
      return <CellMixedFootprint cell={cell} filters={filters} />
  }
}

export function MapInsightCohortStrip({ affected, total }: { affected: number; total: number }) {
  const pct = total > 0 ? Math.round((100 * affected) / total) : 0
  return (
    <figure className="ai-chat-diagram ai-chat-diagram--cohort" aria-label="Impacted subscribers share of footprint">
      <figcaption className="ai-chat-diagram__caption">Impacted share of footprint cohort</figcaption>
      <div className="ai-chat-diagram__cohort-meta">
        <span>{affected.toLocaleString()}</span>
        <span className="ai-chat-diagram__cohort-of">of</span>
        <span>{total.toLocaleString()}</span>
        <span className="ai-chat-diagram__cohort-pct">({pct}%)</span>
      </div>
      <div className="ai-chat-diagram__bar ai-chat-diagram__bar--cohort" role="presentation">
        <div className="ai-chat-diagram__fill ai-chat-diagram__fill--cohort-impacted" style={{ width: `${Math.min(100, Math.max(pct, 2))}%` }} />
      </div>
    </figure>
  )
}

export function MapInsightDiagramStack({
  cell,
  filters,
  focus,
  affected,
  total,
}: {
  cell: Cell
  filters: SubscriberGlobalFilters
  focus: DegradationFocus
  affected: number
  total: number
}): ReactNode {
  return (
    <div className="ai-chat-diagram-stack">
      <MapInsightPrimaryDiagram cell={cell} filters={filters} focus={focus} />
      <MapInsightCohortStrip affected={affected} total={total} />
    </div>
  )
}

export type MapCellInsightPayload = {
  userText: string
  assistantText: string
  diagram: ReactNode
  focus: DegradationFocus
}

/** Async stub; swap for API-backed insight later. */
export async function fetchMapCellInsight(args: {
  cell: Cell
  filters: SubscriberGlobalFilters
  lensImpactType: ImpactRankingLens
  affected: number
  total: number
  environment: string
}): Promise<MapCellInsightPayload> {
  await new Promise((r) => {
    window.setTimeout(r, 140)
  })
  const focus = inferCellDegradationFocus(args.cell, args.filters, args.lensImpactType)
  const rawAssistant = buildMapInsightAssistantText(
    args.cell,
    args.cell.id,
    args.filters,
    args.lensImpactType,
    focus,
    args.affected,
    args.total,
    args.environment,
  )
  return {
    userText: buildMapInsightUserText(args.cell, args.cell.id),
    assistantText: flattenAssistantMarkdownForChat(rawAssistant),
    focus,
    diagram: (
      <MapInsightDiagramStack
        cell={args.cell}
        filters={args.filters}
        focus={focus}
        affected={args.affected}
        total={args.total}
      />
    ),
  }
}
