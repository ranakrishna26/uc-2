import type { CellLeaderboardFlags } from '../../data/placeholderNetwork'

export type LeaderboardExplainListMode = 'impacted-subscribers' | 'worst-cells'

/** Payload from the impact ranking “Explain with AI” control. */
export type LeaderboardAiExplainInput = {
  cellId: string
  cellName: string
  affected: number
  total: number
  fromAnchors: boolean
  environment: string
  impactLensLabel: string
  listMode: LeaderboardExplainListMode
  flags: CellLeaderboardFlags
  rankIndex: number
  rankTotal: number
}

function rankNarrative(rankIndex: number, rankTotal: number, listMode: LeaderboardExplainListMode): string {
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

export function formatLeaderboardRankPhrase(d: LeaderboardAiExplainInput): string {
  return rankNarrative(d.rankIndex, d.rankTotal, d.listMode)
}

export function buildLeaderboardRowExplainUserText(d: LeaderboardAiExplainInput): string {
  const viewLabel =
    d.listMode === 'impacted-subscribers' ? 'impacted-subscriber volume ranking' : 'worst-cell KPI ranking'
  return [
    `Summarize this impact-ranking row for an RAN / NOC operator.`,
    `View: ${viewLabel}. Cell ${d.cellName} (${d.cellId}).`,
    `Focus on counts, impacted share, trail icons, and the top 3 verification or escalation steps—not generic theory.`,
  ].join(' ')
}
