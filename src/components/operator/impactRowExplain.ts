import type { Cell, CellImpactRankingFlags } from '../../data/placeholderNetwork'

export type ImpactRankingListMode = 'impacted-subscribers' | 'worst-cells'

/** Payload from the impact cell ranking “Explain with AI” control. */
export type ImpactRowAiExplainInput = {
  cellId: string
  cellName: string
  affected: number
  total: number
  fromAnchors: boolean
  environment: string
  impactLensLabel: string
  listMode: ImpactRankingListMode
  flags: CellImpactRankingFlags
  rankIndex: number
  rankTotal: number
}

function trailNarrative(flags: CellImpactRankingFlags): string {
  const bits: string[] = []
  if (flags.vip) {
    bits.push(
      'VIP concentration in the filtered footprint (worth checking whether premium subscribers are over-represented in the impacted set before customer comms).',
    )
  }
  if (flags.issueConnectivity) {
    bits.push(
      'Connectivity / attach-side stress in the cell-aggregated subscriber window (NR RRC, attach, or SA–NSA edge issues are common follow-ups).',
    )
  }
  if (flags.issueReliability) {
    bits.push(
      'Reliability stress (drops, handover success, retainability) relative to targets — often pairs with neighbor or mobility parameter drift.',
    )
  }
  if (flags.issueSignal) {
    bits.push(
      'RF / signal quality off target (RSRP/RSRQ/BLER family) — consider tilt/azimuth, overshooters, or indoor penetration.',
    )
  }
  if (flags.issueThroughput) {
    bits.push(
      'Throughput off target for DL/UL — can be capacity, scheduler, transport, or RF-limited; correlate with PRB and contention.',
    )
  }
  if (bits.length === 0) {
    return 'No issue icons are lit on this row for the current cohort slice. That can happen when the impacted rule hits subscribers whose per-pillar scores stay below the chip threshold, or when the window is small; it does not automatically mean the site is healthy — use KPI drill and map context.'
  }
  return bits.join('\n\n')
}

export function formatImpactRowRankPhrase(d: ImpactRowAiExplainInput): string {
  return rankNarrative(d.rankIndex, d.rankTotal, d.listMode)
}

function rankNarrative(rankIndex: number, rankTotal: number, listMode: ImpactRankingListMode): string {
  if (rankTotal <= 1) {
    return 'Only one cell is visible in this filtered list, so there is no relative ordering beyond this row.'
  }
  const pos = rankIndex + 1
  const topQ = Math.max(1, Math.ceil(rankTotal * 0.15))
  const upper = Math.max(1, Math.ceil(rankTotal * 0.4))
  let band: string
  if (rankIndex === 0) {
    band = listMode === 'impacted-subscribers' ? 'highest impacted volume in view' : 'worst KPI position in view'
  } else if (pos <= topQ) {
    band = 'near the top of the current sort'
  } else if (pos <= upper) {
    band = 'upper mid-pack'
  } else if (pos <= Math.ceil(rankTotal * 0.7)) {
    band = 'mid-list'
  } else {
    band = 'lower in the current list'
  }
  const pctFromHead = Math.round((100 * rankIndex) / Math.max(rankTotal - 1, 1))
  return `Sorted position ${pos} of ${rankTotal} (${band}; about ${pctFromHead}% down from the head of this view).`
}

function listModeNarrative(listMode: ImpactRankingListMode, impactLensLabel: string): string {
  if (listMode === 'impacted-subscribers') {
    return `Impacted-subscriber mode ranks by how many subscribers satisfy the “impacted” predicate for the lens (“${impactLensLabel}”). When the lens is “All impact types…”, that is a union across connectivity, reliability, signal, and throughput rules — counts are not mutually exclusive pillars, they are people-level OR logic.`
  }
  return `Worst-cells mode ranks by KPI stress for the lens (“${impactLensLabel}”). For a single pillar it uses that pillar’s default KPI ordering; for “All” it blends ranks across the four default KPIs so you see sites that are broadly stressed, not only strong in one KPI.`
}

export function buildImpactRowExplainUserText(d: ImpactRowAiExplainInput): string {
  const viewLabel =
    d.listMode === 'impacted-subscribers' ? 'impacted-subscriber volume ranking' : 'worst-cell KPI ranking'
  return [
    `Explain this impact ranking row in depth for an RAN / NOC operator.`,
    `View: ${viewLabel}. Cell ${d.cellName} (${d.cellId}).`,
    `Interpret counts, impacted share, trail icons, and give concrete verification and escalation steps.`,
  ].join(' ')
}

export function buildImpactRowExplainAssistantText(
  d: ImpactRowAiExplainInput,
  opts: { filterSummary: string; cell: Cell | null },
): string {
  const { filterSummary, cell } = opts
  const sharePct = d.total > 0 ? Math.round((100 * d.affected) / d.total) : 0
  const cohortLine =
    d.total === 0
      ? 'Cohort: no subscribers match the current global filters on this cell’s footprint anchors, so both impacted and total are zero until filters or scope change.'
      : `Cohort: ${d.affected.toLocaleString()} impacted of ${d.total.toLocaleString()} in footprint after filters (${sharePct}% impacted). Counts are synthetic demo data but mirror how a live cohort would be sliced.`

  const anchorLine = d.fromAnchors
    ? 'Footprint is anchored to subscribers whose primary cell matches this site in the demo model.'
    : 'Footprint anchoring is thin for this slice (fromAnchors=false in the model) — treat relative ranking cautiously until the cohort widens.'

  const lines: string[] = []

  lines.push(`Impact ranking analysis — ${d.cellName} (${d.cellId})`)
  lines.push('')
  lines.push(`Active filter summary: ${filterSummary}`)
  lines.push('')
  lines.push(`Impact lens: ${d.impactLensLabel}`)
  lines.push(listModeNarrative(d.listMode, d.impactLensLabel))
  lines.push('')
  lines.push(cohortLine)
  lines.push(anchorLine)
  lines.push('')
  lines.push(`Declared environment label: ${d.environment} (deterministic label from cell id in the prototype).`)

  if (cell) {
    lines.push('')
    lines.push(
      `Cell record: vendor ${cell.vendor}, site ${cell.siteCode}, sector ${cell.sector}, band ${cell.band} (${cell.bandwidthMhz} MHz), PCI ${cell.pci}, electrical tilt ${cell.electricalTiltDeg}°, height ${cell.antennaHeightM} m, TAC ${cell.tac}.`,
    )
    lines.push(
      `Quick cell counters in the model: setup/access failures ${cell.setupAccessFailures}, call drops ${cell.callDrops}, DL ${cell.dlMbps} Mbps / UL ${cell.ulMbps} Mbps, HO success ${cell.hoSuccessPct}%.`,
    )
  }

  lines.push('')
  lines.push(`Where this row sits: ${rankNarrative(d.rankIndex, d.rankTotal, d.listMode)}`)

  lines.push('')
  lines.push('Issue / VIP trail (icons on the row)')
  lines.push(trailNarrative(d.flags))

  lines.push('')
  lines.push('How to read the row holistically')
  lines.push(
    'High impacted counts with throughput + signal icons often point to RF or capacity; connectivity-first patterns suggest attach / policy / core-edge alignment; reliability-heavy patterns warrant mobility and neighbor audits (Xn/S1, HO margins, RLF). If VIP is lit, validate tariff mix and whether degradation is concentrated on premium subscribers before outreach.',
  )

  lines.push('')
  lines.push('Suggested next steps (operator checklist)')
  lines.push(
    [
      '- Open this cell on the map and compare immediate neighbors (same band cluster and site ring).',
      '- Drill from map to subscriber/session context for anchors on this cell and compare session KPI bands to the active impact lens.',
      '- Pull recent CM changes, alarms, and transport events for the site code; correlate with the time window above.',
      '- If impacted share is high but few icons show, widen time or relax subscriber filters to avoid over-interpreting a tiny cohort.',
      '- Package for ticketing: impacted share, top co-stress pillars from icons, default KPI values for the lens, and neighbor HO/RLF counters.',
    ].join('\n'),
  )

  lines.push('')
  lines.push(
    'This reply is deterministic demo copy generated from your row, filters, and trail flags — wire a model or ticketing API here for live answers. Ask a follow-up to go deeper on one pillar or neighbor set.',
  )

  return lines.join('\n')
}
