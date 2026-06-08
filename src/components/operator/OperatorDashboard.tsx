import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CELLS,
  IMPACT_TYPE_DEFAULT_KPI,
  IMPACT_TYPES_ORDER,
  SUBSCRIBERS,
  applyGlobalSubscriberFilters,
  cellById,
  cellEnvironmentLabel,
  cellImpactSubscriberCounts,
  cellKpiValue,
  cellLeaderboardTrailFlags,
  comparePeriodBLabel,
  computePeriodBKpiValueByKpi,
  formatKpiValue,
  formatSessionDuration,
  formatSessionStartLocal,
  getSessions,
  globalTimeRangeLabel,
  impactTypeFromKpiId,
  rankedCellsByKpi,
  sessionKpiValue,
  sortSubscribersByKpi,
  sortSubscribersByKpiMixedSegments,
  subscriberKpiValue,
  type ComparePeriodOption,
  type ImpactType,
  type LeaderboardImpactLens,
  type Subscriber as NetworkSubscriber,
  type SubscriberDevice,
  type SubscriberGlobalFilters,
} from '../../data/placeholderNetwork'
import { GlobalFiltersBar } from './GlobalFiltersBar'
import { AiChatDock, type AiChatDockHandle } from './AiChatDock'
import {
  ImpactLeaderboard,
  type ImpactLeaderboardAiExplainDetail,
  type LeaderboardListMode,
} from './ImpactLeaderboard'
import { OperatorMap } from './OperatorMap'
import {
  DEFAULT_GLOBAL_FILTER_SNAPSHOT,
  loadFilterPresets,
  newPresetId,
  persistFilterPresets,
  type GlobalFilterSnapshot,
  type SavedFilterPreset,
} from '../../utils/filterPresets'
import {
  normalizePostcodeSelection,
  normalizeRegionSelection,
  unionCellIdsForGeoSelection,
} from '../../data/operatorGeoFilters'
import { correlatedKpiIdsForLens, correlatedSessionSummary } from '../../data/kpiCorrelations'
import {
  KPI_BY_ID,
  kpiDistributionBins,
  type KpiDistributionBin,
  type KpiId,
} from '../../data/kpis'
import { DashboardTopHeader } from './DashboardTopHeader'
import { buildImpactRowExplainUserText } from './impactRowExplain'
import { RowInsightCard } from './RowInsightCard'
import { fetchMapCellInsight } from './mapCellInsight'

type View = 'cells' | 'sessions'

type SessionPoint = ReturnType<typeof getSessions>[number]

/** Default session table: connectivity is degraded or intermittent only (stable rows need Show all sessions). */
function sessionPassesStressTableFilter(session: SessionPoint): boolean {
  const c = session.connectivity.toLowerCase()
  return c.includes('intermittent') || c.includes('degraded')
}

type TrendDatum = {
  i: number
  tp: number
  id: string | null
  cellId: string | null
  cellName: string | null
  peerBackdrop: number | null
  peerAvg: number | null
  peerLow: number | null
  peerHigh: number | null
  peerCount: number
  bucketSize: number
  bucketCellCount: number
  p10: number
  p90: number
  low: number
  high: number
  isAggregated: boolean
}

function distributionBinIndex(value: number, bins: KpiDistributionBin[]): number {
  for (let i = 0; i < bins.length; i += 1) {
    const bin = bins[i]
    if (value >= bin.min && value < bin.max) return i
  }
  return Math.max(0, bins.length - 1)
}

function distributionStats(values: number[], bins: KpiDistributionBin[]) {
  const counts = new Array(bins.length).fill(0)
  for (const value of values) {
    const idx = distributionBinIndex(value, bins)
    counts[idx] += 1
  }
  const total = values.length
  let cumulativePct = 0
  return bins.map((_, idx) => {
    const count = counts[idx]
    const pct = total > 0 ? (count / total) * 100 : 0
    cumulativePct = Math.min(100, cumulativePct + pct)
    return { count, pct, cdfPct: cumulativePct }
  })
}

function matchImsi(q: string, imsi: string): boolean {
  const n = q.replace(/\s/g, '').toLowerCase()
  if (!n) return true
  return imsi.replace(/\s/g, '').toLowerCase().includes(n)
}

function subscriberDeviceLabel(device: SubscriberDevice): string {
  switch (device) {
    case 'phone':
      return 'Mobile handset'
    case 'cpe':
      return 'CPE / fixed wireless'
    case 'module':
      return 'IoT / embedded module'
    default:
      return device
  }
}

function SubscriberDetailsPanel({
  subscriber,
  lensKpiId,
  showTitle = true,
}: {
  subscriber: NetworkSubscriber
  lensKpiId: KpiId
  /** When false, only the fact grid is shown (e.g. under breadcrumb that already shows Subscriber: IMSI). */
  showTitle?: boolean
}) {
  const anchor = cellById(subscriber.cellId)
  const kpiMeta = KPI_BY_ID[lensKpiId]
  const kpiDisplay = formatKpiValue(lensKpiId, subscriberKpiValue(subscriber, lensKpiId))

  const grid = (
    <div
      className="subscriber-details-grid"
      role="group"
      aria-label={showTitle ? 'Subscriber details' : 'Subscriber profile and metrics'}
    >
      <span>
        <strong>Cell</strong>: {subscriber.cellName}
      </span>
      <span>
        <strong>Sessions</strong>: {subscriber.sessions.toLocaleString()}
      </span>
      <span>
        <strong>{kpiMeta.label}</strong>: <span className="mono">{kpiDisplay}</span>
      </span>
      <span>
        <strong>Device</strong>: {subscriberDeviceLabel(subscriber.device)}
      </span>
      <span>
        <strong>Subscriber type</strong>: {subscriber.segment}
      </span>
      <span>
        <strong>Technology</strong>: {subscriber.technology.toUpperCase()} {subscriber.mode.toUpperCase()}
      </span>
      <span>
        <strong>Service</strong>: {subscriber.service}
      </span>
      <span>
        <strong>Neighbor cells</strong>: {anchor?.neighborIds.length ?? 0}
      </span>
      <span>
        <strong>Setup/access failures</strong>: {subscriber.setupAccessFailures}
      </span>
      <span>
        <strong>Call drops</strong>: {subscriber.callDrops}
      </span>
      <span>
        <strong>DL throughput</strong>: {subscriber.dlMbps} Mbps
      </span>
      <span>
        <strong>UL throughput</strong>: {subscriber.ulMbps} Mbps
      </span>
      <span>
        <strong>HO success</strong>: {subscriber.hoSuccessPct.toFixed(1)}%
      </span>
    </div>
  )

  if (!showTitle) {
    return grid
  }

  return (
    <section className="subscriber-details-panel" aria-labelledby={`subscriber-details-h-${subscriber.imsi}`}>
      <h3 className="subscriber-details-panel__title" id={`subscriber-details-h-${subscriber.imsi}`}>
        <span className="subscriber-details-panel__title-label">Subscriber:</span>
        <span className="mono">{subscriber.imsi}</span>
      </h3>
      {grid}
    </section>
  )
}

function SessionTableBreadcrumb({
  selectedImsi,
  onBackToCells,
}: {
  selectedImsi: string
  onBackToCells: () => void
}) {
  return (
    <nav className="table-breadcrumb table-breadcrumb--compact" aria-label="Subscriber context">
      <ol className="table-breadcrumb-list">
        <li className="table-breadcrumb-item">
          <button type="button" className="table-breadcrumb-back" onClick={onBackToCells} aria-label="Back to cell list">
            ←
          </button>
        </li>
        <li className="table-breadcrumb-item">
          <span className="table-breadcrumb-current" aria-current="page">
            <span className="table-breadcrumb-current-label">Subscriber:</span>{' '}
            <span className="mono">{selectedImsi}</span>
          </span>
        </li>
      </ol>
    </nav>
  )
}

function connectivityChipClass(connectivity: string): string {
  const c = connectivity.toLowerCase()
  if (c.includes('intermittent')) return 'connectivity-chip--intermittent'
  if (c.includes('degraded')) return 'connectivity-chip--degraded'
  return 'connectivity-chip--stable'
}

function connectivityLabelSentenceCase(connectivity: string): string {
  const t = connectivity.trim()
  if (!t) return t
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

function SessionCorrelatedKpisSection({
  session,
  lensKpiId,
}: {
  session: SessionPoint
  lensKpiId: KpiId
}) {
  const ids = useMemo(() => correlatedKpiIdsForLens(lensKpiId), [lensKpiId])
  const lensDef = KPI_BY_ID[lensKpiId]
  const lensVal = sessionKpiValue(session, lensKpiId)
  const summary = useMemo(
    () => correlatedSessionSummary(lensKpiId, (id) => sessionKpiValue(session, id)),
    [lensKpiId, session],
  )
  return (
    <section
      className="session-correlated-section"
      aria-labelledby="session-correlated-h"
      aria-describedby="session-correlated-summary"
    >
      <h3 className="session-correlated-section__title" id="session-correlated-h">
        Correlated KPIs
      </h3>
      <div className="session-correlated-lens-strip" aria-label="Global lens value for this session">
        <span className="session-correlated-lens-strip__label">{lensDef.label}</span>
        <span className="session-correlated-lens-strip__value mono">{formatKpiValue(lensKpiId, lensVal)}</span>
      </div>
      {ids.length > 0 ? (
        <dl className="session-correlated-dl">
          {ids.map((kpiId) => (
            <div key={kpiId} className="session-correlated-dl__row">
              <dt>{KPI_BY_ID[kpiId].label}</dt>
              <dd className="mono">{formatKpiValue(kpiId, sessionKpiValue(session, kpiId))}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="session-correlated-summary" id="session-correlated-summary">
        {summary}
      </p>
    </section>
  )
}

function SessionDetailSlideOver({
  session,
  lensKpiId,
  onClose,
}: {
  session: SessionPoint
  lensKpiId: KpiId
  onClose: () => void
}) {
  const networkCell = cellById(session.cellId)
  return (
    <div className="session-detail-pane">
      <div className="session-detail-pane__header">
        <div className="session-detail-pane__header-body">
          <div className="session-detail-pane__title-row">
            <p className="session-detail-pane__eyebrow" id="session-detail-pane-title">
              Session details
            </p>
            <button type="button" className="session-detail-pane__close" onClick={onClose} aria-label="Close session details">
              ✕
            </button>
          </div>
          <dl className="session-detail-pane__facts">
            <div className="session-detail-pane__fact-row">
              <dt>Session ID</dt>
              <dd className="mono">{session.id}</dd>
            </div>
            <div className="session-detail-pane__fact-row">
              <dt>Serving cell</dt>
              <dd>
                {session.cellName} <span className="mono">({session.cellId})</span>
              </dd>
            </div>
            {networkCell ? (
              <div className="session-detail-pane__fact-row">
                <dt>Site / sector / band</dt>
                <dd>
                  Site {networkCell.siteCode} · sector {networkCell.sector} · band {networkCell.band}
                </dd>
              </div>
            ) : null}
            <div className="session-detail-pane__fact-row">
              <dt>Duration</dt>
              <dd>{formatSessionDuration(session.durationMs)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="session-detail-pane__scroll">
        <SessionCorrelatedKpisSection session={session} lensKpiId={lensKpiId} />
      </div>
    </div>
  )
}

export function OperatorDashboard() {
  const [timeRange, setTimeRange] = useState('24h')
  const [customTimeRangeStart, setCustomTimeRangeStart] = useState('')
  const [customTimeRangeEnd, setCustomTimeRangeEnd] = useState('')
  const [service, setService] = useState('all')
  const [networkMode, setNetworkMode] = useState<'all' | 'sa' | 'nsa'>(
    DEFAULT_GLOBAL_FILTER_SNAPSHOT.networkMode,
  )
  const [subscriberType, setSubscriberType] = useState('all')
  const [selectedKpiId, setSelectedKpiId] = useState<KpiId>(DEFAULT_GLOBAL_FILTER_SNAPSHOT.selectedKpiId)
  const [cellAttributes, setCellAttributes] = useState('')
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>(
    () => DEFAULT_GLOBAL_FILTER_SNAPSHOT.selectedRegionIds,
  )
  const [selectedPostcodeAreaIds, setSelectedPostcodeAreaIds] = useState<string[]>(
    () => DEFAULT_GLOBAL_FILTER_SNAPSHOT.selectedPostcodeAreaIds,
  )

  const [filterPresets, setFilterPresets] = useState<SavedFilterPreset[]>(() =>
    loadFilterPresets(),
  )

  useEffect(() => {
    persistFilterPresets(filterPresets)
  }, [filterPresets])

  const [view, setView] = useState<View>('cells')
  const [selectedImsi, setSelectedImsi] = useState<string | null>(null)
  /** STATE 3: filter session table to one cell (map click); cleared on background click or navigation. */
  const [sessionCellFilter, setSessionCellFilter] = useState<string | null>(null)
  /** When false (default), session table/map use stress-only rows; when true, show every session in scope. */
  const [showAllSessions, setShowAllSessions] = useState(false)
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([])
  const [sessionSelectionAnchorId, setSessionSelectionAnchorId] = useState<string | null>(null)
  /** Open slide-over session inspector (plain row click); cleared on nav / multi-select / backdrop. */
  const [sessionDetailPaneId, setSessionDetailPaneId] = useState<string | null>(null)
  const [tableImsiSearch, setTableImsiSearch] = useState('')
  const [leaderboardListMode, setLeaderboardListMode] = useState<LeaderboardListMode>('impacted-subscribers')
  const [impactType, setImpactType] = useState<LeaderboardImpactLens>(
    () => impactTypeFromKpiId(DEFAULT_GLOBAL_FILTER_SNAPSHOT.selectedKpiId) ?? 'All',
  )

  const [comparePeriodB, setComparePeriodB] = useState<ComparePeriodOption>('7d')
  const [customRangeStart, setCustomRangeStart] = useState('')
  const [customRangeEnd, setCustomRangeEnd] = useState('')
  const [showComparisonCdf, setShowComparisonCdf] = useState(false)
  const aiChatRef = useRef<AiChatDockHandle>(null)

  const handleAiExplainRow = useCallback(
    (detail: ImpactLeaderboardAiExplainDetail) => {
      const cell = cellById(detail.cellId) ?? null
      const timeLabel =
        timeRange === 'custom' && customTimeRangeStart && customTimeRangeEnd
          ? `${customTimeRangeStart} → ${customTimeRangeEnd}`
          : globalTimeRangeLabel(timeRange)
      const geoBits: string[] = []
      if (selectedRegionIds.length) geoBits.push(`${selectedRegionIds.length} region(s)`)
      if (selectedPostcodeAreaIds.length) geoBits.push(`${selectedPostcodeAreaIds.length} postcode area(s)`)
      const filterSummary = [
        `time ${timeLabel}`,
        `service ${service}`,
        `subscriber type ${subscriberType}`,
        `mode ${networkMode}`,
        geoBits.length ? `geo ${geoBits.join(', ')}` : 'geo all',
      ].join(' · ')

      const userText = buildImpactRowExplainUserText(detail)
      aiChatRef.current?.openWithContext({
        userText,
        assistantBody: (
          <RowInsightCard detail={detail} filterSummary={filterSummary} cell={cell} />
        ),
        replaceMapInsight: false,
      })
    },
    [
      customTimeRangeEnd,
      customTimeRangeStart,
      networkMode,
      selectedPostcodeAreaIds,
      selectedRegionIds,
      service,
      subscriberType,
      timeRange,
    ],
  )

  const subscriberGlobalFilters: SubscriberGlobalFilters = useMemo(
    () => ({
      timeRange,
      customTimeRangeStart,
      customTimeRangeEnd,
      service,
      networkMode,
      subscriberType,
      selectedRegionIds,
      selectedPostcodeAreaIds,
    }),
    [
      timeRange,
      customTimeRangeStart,
      customTimeRangeEnd,
      service,
      networkMode,
      subscriberType,
      selectedRegionIds,
      selectedPostcodeAreaIds,
    ],
  )

  useEffect(() => {
    const geo = unionCellIdsForGeoSelection(selectedRegionIds, selectedPostcodeAreaIds)
    if (geo === null) return
    queueMicrotask(() => {
      if (selectedImsi) {
        const anchor = SUBSCRIBERS.find((s) => s.imsi === selectedImsi)?.cellId
        if (anchor && !geo.has(anchor)) {
          setSelectedImsi(null)
          setTableImsiSearch('')
          setSessionCellFilter(null)
          setSelectedSessionIds([])
          setSessionSelectionAnchorId(null)
          setSessionDetailPaneId(null)
          setView('cells')
        }
      }
    })
  }, [selectedRegionIds, selectedPostcodeAreaIds, selectedImsi])

  const cellsForLeaderboard = useMemo(() => {
    const geo = unionCellIdsForGeoSelection(selectedRegionIds, selectedPostcodeAreaIds)
    let list = geo ? CELLS.filter((c) => geo.has(c.id)) : [...CELLS]
    const qAttr = cellAttributes.trim().toLowerCase()
    if (qAttr) {
      list = list.filter((c) => c.name.toLowerCase().includes(qAttr) || c.id.toLowerCase().includes(qAttr))
    }
    const qSearch = tableImsiSearch.trim().toLowerCase()
    if (qSearch) {
      list = list.filter((c) => c.name.toLowerCase().includes(qSearch) || c.id.toLowerCase().includes(qSearch))
    }
    return list
  }, [selectedRegionIds, selectedPostcodeAreaIds, cellAttributes, tableImsiSearch])

  const impactLeaderboardRows = useMemo(() => {
    const enriched = cellsForLeaderboard.map((cell) => {
      const counts = cellImpactSubscriberCounts(cell, subscriberGlobalFilters, impactType)
      const flags = cellLeaderboardTrailFlags(cell, subscriberGlobalFilters, impactType)
      let worstMetricLine: string | null = null
      if (leaderboardListMode === 'worst-cells') {
        if (impactType === 'All') {
          worstMetricLine = 'Mean rank across pillars (connectivity, reliability, signal, throughput)'
        } else {
          const pillar: ImpactType = impactType
          const kpiId = IMPACT_TYPE_DEFAULT_KPI[pillar]
          worstMetricLine = `${KPI_BY_ID[kpiId].label}: ${formatKpiValue(
            kpiId,
            cellKpiValue(cell, subscriberGlobalFilters, kpiId),
          )}`
        }
      }
      return { cell, ...counts, flags, worstMetricLine }
    })
    if (leaderboardListMode === 'impacted-subscribers') {
      enriched.sort((a, b) => b.affected - a.affected || b.total - a.total)
      return enriched
    }
    const idSet = new Set(cellsForLeaderboard.map((c) => c.id))
    const worstOrder =
      impactType === 'All'
        ? (() => {
            const rankMaps = IMPACT_TYPES_ORDER.map((p) => {
              const order = rankedCellsByKpi(IMPACT_TYPE_DEFAULT_KPI[p], subscriberGlobalFilters)
              return new Map(order.map((c, i) => [c.id, i]))
            })
            const meanRank = (cellId: string) =>
              rankMaps.reduce((sum, m) => sum + (m.get(cellId) ?? 99999), 0) / rankMaps.length
            return [...cellsForLeaderboard].sort((a, b) => meanRank(a.id) - meanRank(b.id))
          })()
        : rankedCellsByKpi(IMPACT_TYPE_DEFAULT_KPI[impactType], subscriberGlobalFilters).filter((c) =>
            idSet.has(c.id),
          )
    const idx = new Map(worstOrder.map((c, i) => [c.id, i]))
    enriched.sort((a, b) => (idx.get(a.cell.id) ?? 9999) - (idx.get(b.cell.id) ?? 9999))
    return enriched
  }, [cellsForLeaderboard, subscriberGlobalFilters, impactType, leaderboardListMode])

  const imsiQuickMatches = useMemo(() => {
    const q = tableImsiSearch.trim()
    if (!q) return []
    const matches = applyGlobalSubscriberFilters(SUBSCRIBERS, subscriberGlobalFilters).filter((s) =>
      matchImsi(q, s.imsi),
    )
    const ordered =
      subscriberType === 'all'
        ? sortSubscribersByKpiMixedSegments(matches, selectedKpiId)
        : sortSubscribersByKpi(matches, selectedKpiId)
    return ordered.slice(0, 8)
  }, [tableImsiSearch, subscriberGlobalFilters, subscriberType, selectedKpiId])

  const allSessionsForSubscriber = useMemo(
    () => (selectedImsi ? getSessions(selectedImsi, subscriberGlobalFilters) : []),
    [selectedImsi, subscriberGlobalFilters],
  )

  const sessionDrillSubscriber = useMemo(() => {
    if (!selectedImsi) return null
    return SUBSCRIBERS.find((s) => s.imsi === selectedImsi) ?? null
  }, [selectedImsi])

  const sessions = useMemo(() => {
    if (!sessionCellFilter) return allSessionsForSubscriber
    return allSessionsForSubscriber.filter((s) => s.cellId === sessionCellFilter)
  }, [allSessionsForSubscriber, sessionCellFilter])

  const sessionsDisplay = useMemo(() => {
    if (view !== 'sessions' || showAllSessions) return sessions
    return sessions.filter((s) => sessionPassesStressTableFilter(s))
  }, [view, sessions, showAllSessions])

  useEffect(() => {
    queueMicrotask(() => {
      setShowAllSessions(false)
    })
  }, [selectedImsi, sessionCellFilter])

  const sessionDetailPaneSession = useMemo(() => {
    if (!sessionDetailPaneId) return null
    return sessionsDisplay.find((s) => s.id === sessionDetailPaneId) ?? null
  }, [sessionsDisplay, sessionDetailPaneId])

  useEffect(() => {
    if (sessionDetailPaneId && !sessionsDisplay.some((s) => s.id === sessionDetailPaneId)) {
      queueMicrotask(() => {
        setSessionDetailPaneId(null)
      })
    }
  }, [sessionsDisplay, sessionDetailPaneId])

  useEffect(() => {
    if (!sessionDetailPaneId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSessionDetailPaneId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sessionDetailPaneId])

  const isSubscriberSessionView = view === 'sessions' && !!selectedImsi

  const analyticsSessions = useMemo(() => {
    if (!isSubscriberSessionView) return []
    return sessionsDisplay
  }, [isSubscriberSessionView, sessionsDisplay])

  const peerTrendByIndex = useMemo(() => {
    const bucketCount = analyticsSessions.length
    if (!isSubscriberSessionView || !selectedImsi || bucketCount === 0) {
      return new Map<number, { avg: number; min: number; max: number; count: number }>()
    }
    const peerRows = applyGlobalSubscriberFilters(
      SUBSCRIBERS.filter((subscriber) => subscriber.imsi !== selectedImsi),
      subscriberGlobalFilters,
    )
    const stats = Array.from({ length: bucketCount }, () => ({
      sum: 0,
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
      count: 0,
    }))
    for (const peer of peerRows) {
      const peerSessions = getSessions(peer.imsi, subscriberGlobalFilters).filter((session) =>
        sessionCellFilter ? session.cellId === sessionCellFilter : true,
      )
      if (!peerSessions.length) continue
      const denominator = Math.max(peerSessions.length - 1, 1)
      peerSessions.forEach((session, index) => {
        const bucketIndex =
          bucketCount === 1 ? 0 : Math.round((index / denominator) * (bucketCount - 1))
        const bucket = stats[bucketIndex]
        bucket.sum += session.throughputMbps
        bucket.min = Math.min(bucket.min, session.throughputMbps)
        bucket.max = Math.max(bucket.max, session.throughputMbps)
        bucket.count += 1
      })
    }
    const rawAverages = stats.map((bucket) => (bucket.count > 0 ? bucket.sum / bucket.count : null))
    const result = new Map<number, { avg: number; min: number; max: number; count: number }>()
    stats.forEach((value, index) => {
      if (value.count === 0) return
      // Smooth peer trend so it reads as a contextual backdrop, not a per-point trace.
      let smoothedTotal = 0
      let smoothedCount = 0
      for (let offset = -1; offset <= 1; offset += 1) {
        const neighbor = rawAverages[index + offset]
        if (neighbor === null || neighbor === undefined) continue
        smoothedTotal += neighbor
        smoothedCount += 1
      }
      result.set(index, {
        avg: smoothedCount > 0 ? smoothedTotal / smoothedCount : value.sum / value.count,
        min: value.min,
        max: value.max,
        count: value.count,
      })
    })
    return result
  }, [
    analyticsSessions.length,
    isSubscriberSessionView,
    selectedImsi,
    sessionCellFilter,
    subscriberGlobalFilters,
  ])

  const trendData = useMemo<TrendDatum[]>(() => {
    return analyticsSessions.map((s, i) => {
      const peer = peerTrendByIndex.get(i)
      return {
        i,
        tp: s.throughputMbps,
        id: s.id,
        cellId: s.cellId,
        cellName: s.cellName,
        peerBackdrop: peer?.avg ?? null,
        peerAvg: peer?.avg ?? null,
        peerLow: peer?.min ?? null,
        peerHigh: peer?.max ?? null,
        peerCount: peer?.count ?? 0,
        bucketSize: 1,
        bucketCellCount: 1,
        p10: s.throughputMbps,
        p90: s.throughputMbps,
        low: s.throughputMbps,
        high: s.throughputMbps,
        isAggregated: false,
      }
    })
  }, [analyticsSessions, peerTrendByIndex])
  const scatterSourceSessions = useMemo(() => analyticsSessions, [analyticsSessions])
  const scatterData = useMemo(
    () => scatterSourceSessions.map((s) => ({ x: s.signalQuality, y: s.throughputMbps, id: s.id })),
    [scatterSourceSessions],
  )
  const analyticsSessionIdSet = useMemo(
    () => new Set(analyticsSessions.map((session) => session.id)),
    [analyticsSessions],
  )
  const visibleSelectedSessionIds = useMemo(
    () => selectedSessionIds.filter((id) => analyticsSessionIdSet.has(id)),
    [selectedSessionIds, analyticsSessionIdSet],
  )
  const selectedSessionIdSet = useMemo(
    () => new Set(visibleSelectedSessionIds),
    [visibleSelectedSessionIds],
  )
  const selectedTrendPoints = useMemo(
    () => trendData.filter((d) => d.id && selectedSessionIdSet.has(d.id)),
    [trendData, selectedSessionIdSet],
  )
  const trendSessionBands = useMemo(
    () => {
      const palette = [
        'rgba(59, 130, 246, 0.18)',
        'rgba(16, 185, 129, 0.18)',
        'rgba(168, 85, 247, 0.18)',
        'rgba(245, 158, 11, 0.18)',
      ]
      return trendData.map((point, index) => ({
        x1: point.i - 0.5,
        x2: point.i + 0.5,
        fill: palette[index % palette.length],
      }))
    },
    [trendData],
  )
  const selectedScatterPoints = useMemo(
    () => scatterData.filter((d) => selectedSessionIdSet.has(d.id)),
    [scatterData, selectedSessionIdSet],
  )

  const comparisonSourceSessions = useMemo(() => analyticsSessions, [analyticsSessions])

  const comparisonDistributionData = useMemo(() => {
    if (!comparisonSourceSessions.length) return []
    const bins = kpiDistributionBins(selectedKpiId)
    const periodAValues = comparisonSourceSessions.map((session) =>
      sessionKpiValue(session, selectedKpiId),
    )
    const periodBValues = periodAValues.map((value) =>
      computePeriodBKpiValueByKpi(value, selectedKpiId, comparePeriodB, customRangeStart, customRangeEnd),
    )
    const periodAStats = distributionStats(periodAValues, bins)
    const periodBStats = distributionStats(periodBValues, bins)
    return bins.map((bin, idx) => ({
      binLabel: bin.label,
      periodAPct: periodAStats[idx].pct,
      periodBPct: periodBStats[idx].pct,
      periodACdfPct: periodAStats[idx].cdfPct,
      periodBCdfPct: periodBStats[idx].cdfPct,
      periodACount: periodAStats[idx].count,
      periodBCount: periodBStats[idx].count,
    }))
  }, [
    comparisonSourceSessions,
    selectedKpiId,
    comparePeriodB,
    customRangeStart,
    customRangeEnd,
  ])

  const comparisonPeriodALabel =
    timeRange === 'custom' && customTimeRangeStart && customTimeRangeEnd
      ? `${customTimeRangeStart} → ${customTimeRangeEnd}`
      : globalTimeRangeLabel(timeRange)

  const comparisonPeriodBWindowLabel = comparePeriodBLabel(
    comparePeriodB,
    customRangeStart,
    customRangeEnd,
  )

  function handleMapCellSelect(cellId: string) {
    if (view === 'sessions' && selectedImsi) {
      setSessionCellFilter(cellId)
      setSelectedSessionIds([])
      setSessionSelectionAnchorId(null)
      setSessionDetailPaneId(null)
      return
    }
    setSessionCellFilter(null)
    setSelectedImsi(null)
    const cell = cellById(cellId)
    if (!cell) return
    const filters = subscriberGlobalFilters
    const lens = impactType
    void (async () => {
      aiChatRef.current?.setInsightLoading(true)
      try {
        const env = cellEnvironmentLabel(cell)
        const { affected, total } = cellImpactSubscriberCounts(cell, filters, lens)
        const payload = await fetchMapCellInsight({
          cell,
          filters,
          lensImpactType: lens,
          affected,
          total,
          environment: env,
        })
        aiChatRef.current?.openWithContext({
          userText: payload.userText,
          assistantText: payload.assistantText,
          assistantDiagram: payload.diagram,
          replaceMapInsight: true,
          source: 'map-click',
        })
      } catch {
        aiChatRef.current?.openWithContext({
          assistantText: 'Could not load insight for this map selection. Try again.',
          replaceMapInsight: true,
          source: 'map-click',
        })
      } finally {
        aiChatRef.current?.setInsightLoading(false)
      }
    })()
  }

  function handleMapBackgroundClick() {
    if (view === 'sessions' && selectedImsi) {
      setSessionCellFilter(null)
      setSelectedSessionIds([])
      setSessionSelectionAnchorId(null)
      setSessionDetailPaneId(null)
    }
  }

  function selectCellFromTable(cellId: string) {
    setTableImsiSearch('')
    setSelectedSessionIds([])
    setSessionSelectionAnchorId(null)
    setSessionDetailPaneId(null)
    handleMapCellSelect(cellId)
  }

  function backToCells() {
    setView('cells')
    setSelectedImsi(null)
    setSessionCellFilter(null)
    setSelectedSessionIds([])
    setSessionSelectionAnchorId(null)
    setSessionDetailPaneId(null)
    setTableImsiSearch('')
  }

  function openSubscriberFromGlobal(imsi: string) {
    setSelectedImsi(imsi)
    setTableImsiSearch('')
    setSessionCellFilter(null)
    setSelectedSessionIds([])
    setSessionSelectionAnchorId(null)
    setSessionDetailPaneId(null)
    setView('sessions')
  }

  function selectSingleSession(sessionId: string) {
    setSelectedSessionIds([sessionId])
    setSessionSelectionAnchorId(sessionId)
    setSessionDetailPaneId(sessionId)
  }

  function selectSessionFromTable(sessionId: string, rowIndex: number, shiftKey: boolean) {
    if (!shiftKey) {
      selectSingleSession(sessionId)
      return
    }
    setSessionDetailPaneId(null)
    const clickedIsSelected = selectedSessionIdSet.has(sessionId)
    const anchorIndex = sessionSelectionAnchorId
      ? sessionsDisplay.findIndex((s) => s.id === sessionSelectionAnchorId)
      : -1
    if (anchorIndex < 0 || rowIndex < 0) {
      setSelectedSessionIds((prev) => {
        if (clickedIsSelected) return prev.filter((id) => id !== sessionId)
        return [...prev, sessionId]
      })
      setSessionSelectionAnchorId(sessionId)
      return
    }
    const [start, end] = anchorIndex < rowIndex ? [anchorIndex, rowIndex] : [rowIndex, anchorIndex]
    const rangeIds = sessionsDisplay.slice(start, end + 1).map((s) => s.id)
    setSelectedSessionIds((prev) => {
      const next = new Set(prev)
      if (clickedIsSelected) {
        rangeIds.forEach((id) => next.delete(id))
      } else {
        rangeIds.forEach((id) => next.add(id))
      }
      return Array.from(next)
    })
    setSessionSelectionAnchorId(sessionId)
  }

  const mapMode = view === 'sessions' && selectedImsi ? 'subscriberFocus' : 'all'
  const showAnalytics = isSubscriberSessionView
  const selectedKpiMeta = KPI_BY_ID[selectedKpiId]
  const showSessionInspector = Boolean(
    view === 'sessions' && selectedImsi && sessionDetailPaneSession && sessionDetailPaneId,
  )

  function snapshotGlobalFilters(): GlobalFilterSnapshot {
    return {
      timeRange,
      customTimeRangeStart,
      customTimeRangeEnd,
      service,
      networkMode,
      subscriberType,
      cellAttributes,
      selectedRegionIds,
      selectedPostcodeAreaIds,
      selectedKpiId,
    }
  }

  function handleApplyPreset(id: string) {
    const preset = filterPresets.find((p) => p.id === id)
    if (!preset) return
    const { filters } = preset
    setTimeRange(filters.timeRange)
    setCustomTimeRangeStart(filters.customTimeRangeStart)
    setCustomTimeRangeEnd(filters.customTimeRangeEnd)
    setService(filters.service)
    setNetworkMode(filters.networkMode)
    setSubscriberType(filters.subscriberType)
    setCellAttributes(filters.cellAttributes)
    setSelectedRegionIds(normalizeRegionSelection(filters.selectedRegionIds))
    setSelectedPostcodeAreaIds(normalizePostcodeSelection(filters.selectedPostcodeAreaIds))
  }

  function handleSavePreset(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const next: SavedFilterPreset = {
      id: newPresetId(),
      name: trimmed,
      savedAt: new Date().toISOString(),
      filters: snapshotGlobalFilters(),
    }
    setFilterPresets((prev) => [...prev, next])
  }

  function handleDeletePreset(id: string | null) {
    if (!id) return
    const preset = filterPresets.find((p) => p.id === id)
    if (
      preset &&
      typeof window !== 'undefined' &&
      !window.confirm(`Remove preset "${preset.name}"?`)
    ) {
      return
    }
    setFilterPresets((prev) => prev.filter((p) => p.id !== id))
  }

  function handleSelectedKpiIdChange(next: KpiId) {
    setSelectedKpiId(next)
    const it = impactTypeFromKpiId(next)
    setImpactType(it ?? 'All')
  }

  function handleImpactTypeChange(next: LeaderboardImpactLens) {
    setImpactType(next)
    if (next !== 'All') {
      setSelectedKpiId(IMPACT_TYPE_DEFAULT_KPI[next])
    }
  }

  return (
    <div className="operator-app">
      <DashboardTopHeader />
      <GlobalFiltersBar
        timeRange={timeRange}
        onTimeRange={setTimeRange}
        customTimeRangeStart={customTimeRangeStart}
        onCustomTimeRangeStart={setCustomTimeRangeStart}
        customTimeRangeEnd={customTimeRangeEnd}
        onCustomTimeRangeEnd={setCustomTimeRangeEnd}
        service={service}
        onService={setService}
        subscriberType={subscriberType}
        onSubscriberType={setSubscriberType}
        networkMode={networkMode}
        onNetworkMode={setNetworkMode}
        cellAttributes={cellAttributes}
        onCellAttributes={setCellAttributes}
        selectedRegionIds={selectedRegionIds}
        onSelectedRegionIds={setSelectedRegionIds}
        selectedPostcodeAreaIds={selectedPostcodeAreaIds}
        onSelectedPostcodeAreaIds={setSelectedPostcodeAreaIds}
        selectedKpiId={selectedKpiId}
        onSelectedKpiId={handleSelectedKpiIdChange}
        presets={filterPresets}
        onApplyPreset={handleApplyPreset}
        onSavePreset={handleSavePreset}
        onDeletePreset={handleDeletePreset}
      />

      <div className={`workspace${showSessionInspector ? ' workspace--session-inspector' : ''}`}>
        <section className="pane table-pane">
          <div className="table-stack">
            {view === 'cells' ? (
              <>
                <div className="table-scroll table-scroll--impact-leaderboard">
                  <ImpactLeaderboard
                    listMode={leaderboardListMode}
                    onListMode={setLeaderboardListMode}
                    impactType={impactType}
                    onImpactType={handleImpactTypeChange}
                    search={tableImsiSearch}
                    onSearch={setTableImsiSearch}
                    rows={impactLeaderboardRows}
                    onSelectCell={selectCellFromTable}
                    onAiExplainRow={handleAiExplainRow}
                  />
                </div>
                {leaderboardListMode === 'impacted-subscribers' &&
                tableImsiSearch.trim() &&
                imsiQuickMatches.length > 0 ? (
                  <div className="quick-matches">
                    <span className="quick-matches-label">Matching subscribers (open session view)</span>
                    <ul>
                      {imsiQuickMatches.map((s) => (
                        <li key={s.imsi}>
                          <button type="button" onClick={() => openSubscriberFromGlobal(s.imsi)}>
                            {s.imsi}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}

            {view === 'sessions' && selectedImsi ? (
              <SessionTableBreadcrumb selectedImsi={selectedImsi} onBackToCells={backToCells} />
            ) : null}

            {view === 'sessions' && selectedImsi && (
              <>
                {sessionDrillSubscriber ? (
                  <div className="subscriber-session-profile">
                    <SubscriberDetailsPanel
                      subscriber={sessionDrillSubscriber}
                      lensKpiId={selectedKpiId}
                      showTitle={false}
                    />
                  </div>
                ) : null}
                <div className="session-table-toolbar">
                  <label className="session-table-toggle-all">
                    <input
                      type="checkbox"
                      checked={showAllSessions}
                      onChange={(e) => setShowAllSessions(e.target.checked)}
                    />
                    <span>Show all sessions</span>
                  </label>
                </div>
                {!showAllSessions && sessionsDisplay.length === 0 ? (
                  <p className="session-table-filter-empty">
                    No sessions in this scope have degraded or intermittent connectivity. Turn on Show all sessions to
                    list every session in scope.
                  </p>
                ) : null}
                <h3 className="block-title session-list-title" id="session-list-title">
                  Session list
                </h3>
                <div
                  className="table-scroll table-scroll--session-table"
                  role="region"
                  aria-labelledby="session-list-title"
                >
                  <table className="minimal-table session-table">
                    <thead>
                      <tr>
                        <th>Session ID</th>
                        <th>Time</th>
                        <th>Connectivity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionsDisplay.map((s, i) => (
                        <tr
                          key={s.id}
                          className={
                            [
                              sessionCellFilter && s.cellId === sessionCellFilter
                                ? 'session-row--cell-focus'
                                : '',
                              selectedSessionIdSet.has(s.id) ? 'session-row--selected' : '',
                            ]
                              .filter(Boolean)
                              .join(' ') || undefined
                          }
                          onClick={(e) => selectSessionFromTable(s.id, i, e.shiftKey)}
                        >
                          <td className="mono">{s.id}</td>
                          <td className="mono session-time-cell">{formatSessionStartLocal(s.sessionStart)}</td>
                          <td className="session-connectivity-cell">
                            <span
                              className={`connectivity-chip ${connectivityChipClass(s.connectivity)}`}
                            >
                              {connectivityLabelSentenceCase(s.connectivity)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>

        {showSessionInspector && sessionDetailPaneSession ? (
          <section className="pane session-inspector-pane" aria-label="Session inspector">
            <SessionDetailSlideOver
              session={sessionDetailPaneSession}
              lensKpiId={selectedKpiId}
              onClose={() => setSessionDetailPaneId(null)}
            />
          </section>
        ) : null}

        <section
          className={`pane detail-pane${showAnalytics ? ' detail-pane--sessions' : ''}`}
        >
          <div className="detail-stack">
            <div className="detail-map-slot">
              <div className="detail-map-slot__stack">
                <div className="detail-map-slot__map">
                  <OperatorMap
                    mode={mapMode}
                    selectedCellId={null}
                    subscriberImsi={selectedImsi}
                    selectedKpiId={selectedKpiId}
                    sessions={sessionsDisplay}
                    selectedSessionIds={visibleSelectedSessionIds}
                    onSessionSelect={selectSingleSession}
                    sessionTableCellFilter={sessionCellFilter}
                    showHoverKpis={view === 'sessions'}
                    embed={showAnalytics ? 'compact' : 'full'}
                    subscriberGlobalFilters={subscriberGlobalFilters}
                    onCellSelect={handleMapCellSelect}
                    onMapBackgroundClick={handleMapBackgroundClick}
                  />
                </div>
                <AiChatDock ref={aiChatRef} />
              </div>
            </div>

            {showAnalytics && (
              <div className="session-analytics-scroll">
                <div className="charts-block">
                  <h3 className="block-title">Session charts</h3>
                  <div className="chart-grid">
                    <figure className="chart-fig">
                      <figcaption>Throughput trend</figcaption>
                      <ResponsiveContainer
                        width="100%"
                        height={220}
                        initialDimension={{ width: 360, height: 220 }}
                      >
                        <ComposedChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          {trendSessionBands.map((band) => (
                            <ReferenceArea
                              key={`${band.x1}-${band.x2}`}
                              x1={band.x1}
                              x2={band.x2}
                              fill={band.fill}
                              strokeOpacity={0}
                            />
                          ))}
                          <XAxis
                            type="number"
                            dataKey="i"
                            tick={{ fontSize: 11, fill: '#cbd5e1' }}
                            axisLine={{ stroke: '#475569' }}
                            tickFormatter={(value) => `${Number(value) + 1}`}
                            domain={[-0.5, Math.max(trendData.length - 0.5, 0.5)]}
                            allowDecimals={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: '#cbd5e1' }}
                            axisLine={{ stroke: '#475569' }}
                            unit=" Mbps"
                            domain={[0, 'auto']}
                          />
                          <Tooltip
                            cursor={{ stroke: '#475569', strokeDasharray: '4 3' }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.[0]) return null
                              const d = payload[0].payload as (typeof trendData)[number]
                              return (
                                <div className="chart-tooltip">
                                  <div className="chart-tooltip-title">Session {d.i + 1}</div>
                                  <div className="chart-tooltip-sub">
                                    {d.id} · {d.cellName} ({d.cellId})
                                  </div>
                                  <div className="chart-tooltip-kpi">
                                    Selected subscriber: <strong>{d.tp.toFixed(1)} Mbps</strong>
                                  </div>
                                  {d.peerAvg !== null && d.peerLow !== null && d.peerHigh !== null ? (
                                    <div className="chart-tooltip-kpi">
                                      Peers ({d.peerCount}): {d.peerAvg.toFixed(1)} avg ·{' '}
                                      {d.peerLow.toFixed(1)}-{d.peerHigh.toFixed(1)} Mbps
                                    </div>
                                  ) : (
                                    <div className="chart-tooltip-kpi">Peers: no data</div>
                                  )}
                                </div>
                              )
                            }}
                          />
                          <>
                            <Area
                              type="monotone"
                              dataKey="peerBackdrop"
                              stroke="none"
                              fill="#93c5fd"
                              fillOpacity={0.22}
                              isAnimationActive={false}
                              connectNulls
                            />
                            <Line
                              type="monotone"
                              dataKey="peerAvg"
                              stroke="#93c5fd"
                              strokeWidth={1.5}
                              dot={false}
                              strokeDasharray="4 4"
                              strokeOpacity={0.75}
                              isAnimationActive={false}
                              connectNulls
                            />
                          </>
                          {selectedTrendPoints.map((point) => (
                            <Fragment key={point.id}>
                              <ReferenceArea
                                x1={point.i - 0.5}
                                x2={point.i + 0.5}
                                fill="rgba(245, 158, 11, 0.12)"
                                strokeOpacity={0}
                              />
                              <ReferenceLine x={point.i} stroke="#f59e0b" strokeDasharray="4 3" />
                              <ReferenceDot
                                x={point.i}
                                y={point.tp}
                                r={5}
                                fill="#f59e0b"
                                stroke="#0f172a"
                                strokeWidth={1.4}
                              />
                            </Fragment>
                          ))}
                          <Line
                            type="monotone"
                            dataKey="tp"
                            stroke="#60a5fa"
                            dot={false}
                            strokeWidth={2.4}
                            isAnimationActive={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </figure>
                    <figure className="chart-fig">
                      <figcaption>Signal vs throughput</figcaption>
                      <ResponsiveContainer
                        width="100%"
                        height={220}
                        initialDimension={{ width: 360, height: 220 }}
                      >
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis
                            dataKey="x"
                            name="Signal"
                            type="number"
                            tick={{ fontSize: 11 }}
                          />
                          <YAxis
                            dataKey="y"
                            name="Throughput"
                            type="number"
                            unit=" Mbps"
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                          <Scatter data={scatterData} fill="#2dd4bf" />
                          {selectedScatterPoints.length > 0 && (
                            <Scatter data={selectedScatterPoints} fill="#f59e0b" />
                          )}
                        </ScatterChart>
                      </ResponsiveContainer>
                    </figure>
                  </div>
                </div>

                <div className="compare-block">
                  <h3 className="block-title">Time period comparison</h3>
                  <div className="compare-controls">
                    <label className="compare-select-label">
                      <span>Period B (compare to)</span>
                      <select
                        value={comparePeriodB}
                        onChange={(e) =>
                          setComparePeriodB(e.target.value as ComparePeriodOption)
                        }
                      >
                        <option value="15m">Last 15 minutes</option>
                        <option value="1h">Last 1 hour</option>
                        <option value="24h">Last 24 hours</option>
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="custom">Custom — date range</option>
                      </select>
                    </label>
                    {comparePeriodB === 'custom' && (
                      <div className="custom-range-row">
                        <label>
                          <span>Start</span>
                          <input
                            type="date"
                            value={customRangeStart}
                            onChange={(e) => setCustomRangeStart(e.target.value)}
                          />
                        </label>
                        <label>
                          <span>End</span>
                          <input
                            type="date"
                            value={customRangeEnd}
                            onChange={(e) => setCustomRangeEnd(e.target.value)}
                          />
                        </label>
                      </div>
                    )}
                    <label className="compare-toggle">
                      <input
                        type="checkbox"
                        checked={showComparisonCdf}
                        onChange={(e) => setShowComparisonCdf(e.target.checked)}
                      />
                      <span>Show CDF overlay</span>
                    </label>
                  </div>
                  <figure className="chart-fig compare-chart-fig">
                    <div className="compare-chart-header">
                      <figcaption>{selectedKpiMeta.label}</figcaption>
                      <div className="compare-top-legend" aria-label="Comparison chart legend">
                        <span className="compare-legend-item">
                          <span
                            className="compare-legend-marker compare-legend-marker--period-a"
                            aria-hidden="true"
                          />
                          <span className="compare-legend-text">
                            <strong>Period A</strong> {comparisonPeriodALabel}
                          </span>
                        </span>
                        <span className="compare-legend-item">
                          <span
                            className="compare-legend-marker compare-legend-marker--period-b"
                            aria-hidden="true"
                          />
                          <span className="compare-legend-text">
                            <strong>Period B</strong> {comparisonPeriodBWindowLabel}
                          </span>
                        </span>
                        {showComparisonCdf && (
                          <>
                            <span className="compare-legend-item">
                              <span
                                className="compare-legend-marker compare-legend-marker--cdf-a"
                                aria-hidden="true"
                              />
                              <span className="compare-legend-text">
                                <strong>CDF A</strong>
                              </span>
                            </span>
                            <span className="compare-legend-item">
                              <span
                                className="compare-legend-marker compare-legend-marker--cdf-b"
                                aria-hidden="true"
                              />
                              <span className="compare-legend-text">
                                <strong>CDF B</strong>
                              </span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {comparisonDistributionData.length > 0 ? (
                      <ResponsiveContainer
                        width="100%"
                        height={300}
                        initialDimension={{ width: 360, height: 300 }}
                      >
                        <ComposedChart
                          data={comparisonDistributionData}
                          margin={{ top: 12, right: 20, left: 8, bottom: 74 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                          <XAxis
                            dataKey="binLabel"
                            tick={{ fontSize: 12, fill: '#cbd5e1' }}
                            axisLine={{ stroke: '#475569' }}
                            angle={-24}
                            textAnchor="end"
                            interval={0}
                            height={80}
                          />
                          <YAxis
                            domain={[0, 100]}
                            tick={{ fontSize: 11, fill: '#cbd5e1' }}
                            tickFormatter={(value) => `${value}%`}
                            axisLine={{ stroke: '#475569' }}
                          />
                          <Tooltip
                            cursor={{ fill: 'rgba(96, 165, 250, 0.15)' }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.[0]) return null
                              const d = payload[0].payload as (typeof comparisonDistributionData)[number]
                              return (
                                <div className="chart-tooltip">
                                  <div className="chart-tooltip-title">{d.binLabel}</div>
                                  <div className="chart-tooltip-sub">{selectedKpiMeta.label}</div>
                                  <div className="chart-tooltip-kpi">
                                    <strong>Period A</strong> ({comparisonPeriodALabel}): {d.periodACount}{' '}
                                    sessions ({d.periodAPct.toFixed(1)}%)
                                  </div>
                                  <div className="chart-tooltip-kpi">
                                    <strong>Period B</strong> ({comparisonPeriodBWindowLabel}):{' '}
                                    {d.periodBCount} sessions ({d.periodBPct.toFixed(1)}%)
                                  </div>
                                  {showComparisonCdf && (
                                    <div className="chart-tooltip-kpi">
                                      CDF A/B: {d.periodACdfPct.toFixed(1)}% /{' '}
                                      {d.periodBCdfPct.toFixed(1)}%
                                    </div>
                                  )}
                                </div>
                              )
                            }}
                          />
                          <Bar
                            dataKey="periodAPct"
                            name="Period A %"
                            fill="#60a5fa"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={26}
                          />
                          <Bar
                            dataKey="periodBPct"
                            name="Period B %"
                            fill="#94a3b8"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={26}
                          />
                          {showComparisonCdf && (
                            <>
                              <Line
                                type="monotone"
                                dataKey="periodACdfPct"
                                name="Period A CDF"
                                stroke="#f59e0b"
                                strokeWidth={2}
                                dot={false}
                              />
                              <Line
                                type="monotone"
                                dataKey="periodBCdfPct"
                                name="Period B CDF"
                                stroke="#22d3ee"
                                strokeWidth={2}
                                dot={false}
                                strokeDasharray="4 3"
                              />
                            </>
                          )}
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="muted small">No session data for comparison.</p>
                    )}
                  </figure>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
