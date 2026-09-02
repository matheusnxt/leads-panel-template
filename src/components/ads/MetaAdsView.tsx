'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DollarSign, UserPlus, Target, MessageCircle, MessageSquarePlus, Users,
  Eye, MousePointerClick, Coins, Percent, Gauge, Loader2, TriangleAlert, Play,
  TrendingUp, MessageSquare, Filter, Inbox, Globe, ChevronUp, ChevronDown, ChevronsUpDown,
  GripHorizontal, GitCompare, SlidersHorizontal, Check, ArrowUp, ArrowDown, RotateCcw,
} from 'lucide-react'
import { GridLayout, useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import type { AccountMetrics, DailyPoint, FunnelData, TableRow, CreativeRow } from '@/lib/metaAds'
import { getRange, type DateRangeKey } from '@/lib/dateRange'
import { formatBRL } from '@/lib/currency'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import DateRangeDropdown from '@/components/leads/DateRangeDropdown'
import CreativeModal from './CreativeModal'
import styles from './MetaAdsView.module.css'

const LS_RANGE = 'app-ads-range'
const LS_LAYOUT = 'app-ads-bento'

const int = (n: number) => Math.round(n || 0).toLocaleString('pt-BR')
const pctFmt = (n: number) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
const dec = (n: number) => (n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

type Overview = { metrics: AccountMetrics; daily: DailyPoint[]; funnel: FunnelData }

// ---- Comparação: delta % + se é bom/ruim conforme a direção da métrica -------
type Dir = 'up' | 'down' | 'neutral' // up=maior é melhor, down=menor é melhor
type Delta = { pct: number; good: boolean | null }
function deltaFor(cur: number, prev: number | null | undefined, dir: Dir): Delta | null {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return null
  const pct = ((cur - prev) / prev) * 100
  const good = dir === 'neutral' || Math.abs(pct) < 1.5 ? null : (dir === 'up' ? pct > 0 : pct < 0)
  return { pct, good }
}
// Cor por intensidade: quanto maior a variação, mais viva (verde bom / vermelho ruim).
function deltaStyle(d: Delta): React.CSSProperties {
  if (d.good == null) return { color: 'var(--text-faint)' }
  const t = Math.min(1, Math.abs(d.pct) / 40)
  const hue = d.good ? 145 : 2
  return { color: `hsl(${hue} ${Math.round(45 + t * 45)}% ${Math.round(52 - t * 14)}%)` }
}

// ===========================================================================
export default function MetaAdsView() {
  const { profile } = useSession()
  const isAdmin = profile?.role === 'adm'

  const [dateKey, setDateKey] = useState<DateRangeKey>('last14')
  const [custom, setCustom] = useState({ from: '', to: '' })

  const [ov, setOv] = useState<Overview | null>(null)
  const [ovErr, setOvErr] = useState<string | null>(null)
  const [loadingOv, setLoadingOv] = useState(true)

  const [campaigns, setCampaigns] = useState<TableRow[] | null>(null)
  const [adsets, setAdsets] = useState<TableRow[] | null>(null)
  const [creatives, setCreatives] = useState<CreativeRow[] | null>(null)
  const [openAd, setOpenAd] = useState<{ id: string; name: string } | null>(null)

  const [leadsCenter, setLeadsCenter] = useState<number | null>(null)
  const [leadsSite, setLeadsSite] = useState<number | null>(null)

  // Comparação com o período anterior
  const [compare, setCompare] = useState(false)
  const [prev, setPrev] = useState<Overview | null>(null)
  const [prevLC, setPrevLC] = useState<number | null>(null)
  const [prevLS, setPrevLS] = useState<number | null>(null)

  // Layout do bento (arrastável/redimensionável), persistido
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT)
  const grid = useContainerWidth()

  useEffect(() => {
    try {
      const s = localStorage.getItem(LS_RANGE)
      if (s) { const p = JSON.parse(s); if (p.dateKey) setDateKey(p.dateKey); if (p.custom) setCustom(p.custom) }
      const l = localStorage.getItem(LS_LAYOUT)
      if (l) setLayout(JSON.parse(l))
    } catch { /* ignora */ }
  }, [])

  const persist = (k: DateRangeKey, c: { from: string; to: string }) => {
    try { localStorage.setItem(LS_RANGE, JSON.stringify({ dateKey: k, custom: c })) } catch { /* ignora */ }
  }
  const onDateKey = (k: DateRangeKey) => { setDateKey(k); persist(k, custom) }
  const onCustom = (c: { from: string; to: string }) => { setCustom(c); persist(dateKey, c) }

  const onLayout = (l: Layout) => { setLayout(l); try { localStorage.setItem(LS_LAYOUT, JSON.stringify(l)) } catch { /* ignora */ } }
  const resetLayout = () => { setLayout(DEFAULT_LAYOUT.map(x => ({ ...x }))); try { localStorage.removeItem(LS_LAYOUT) } catch { /* ignora */ } }

  const ready = dateKey !== 'custom' || (Boolean(custom.from) && Boolean(custom.to))
  const qs = useMemo(() => {
    const p = new URLSearchParams({ dateKey })
    if (dateKey === 'custom') { p.set('from', custom.from); p.set('to', custom.to) }
    return p.toString()
  }, [dateKey, custom])

  // Dados do período atual
  useEffect(() => {
    if (!ready) return
    let cancel = false
    setLoadingOv(true); setOv(null); setOvErr(null)
    setCampaigns(null); setAdsets(null); setCreatives(null)
    setLeadsCenter(null); setLeadsSite(null)

    const get = (path: string) => fetch(`/api/meta-ads/${path}${path.includes('?') ? '&' : '?'}${qs}`, { cache: 'no-store' }).then(async r => {
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error ?? `Erro ${r.status}`)
      return j
    })
    get('overview').then(d => { if (!cancel) setOv(d) }).catch(e => { if (!cancel) setOvErr(e.message) }).finally(() => { if (!cancel) setLoadingOv(false) })
    get('table?level=campaign').then(d => { if (!cancel) setCampaigns(d.rows) }).catch(() => { if (!cancel) setCampaigns([]) })
    get('table?level=adset').then(d => { if (!cancel) setAdsets(d.rows) }).catch(() => { if (!cancel) setAdsets([]) })
    get('creatives').then(d => { if (!cancel) setCreatives(d.rows) }).catch(() => { if (!cancel) setCreatives([]) })

    const range = getRange(dateKey, custom)
    const countLeads = async (source: 'meta' | 'site') => {
      let q = supabase.from('leads').select('id', { count: 'exact', head: true }).eq('source', source)
      if (range.from) q = q.gte('created_at', range.from.toISOString())
      if (range.to) q = q.lt('created_at', range.to.toISOString())
      const { count } = await q
      return count ?? 0
    }
    countLeads('meta').then(c => { if (!cancel) setLeadsCenter(c) }).catch(() => { if (!cancel) setLeadsCenter(0) })
    countLeads('site').then(c => { if (!cancel) setLeadsSite(c) }).catch(() => { if (!cancel) setLeadsSite(0) })
    return () => { cancel = true }
  }, [qs, ready, dateKey, custom])

  // Dados do período ANTERIOR (só quando comparação está ligada)
  useEffect(() => {
    if (!compare || !ready) { setPrev(null); setPrevLC(null); setPrevLS(null); return }
    const r = getRange(dateKey, custom)
    if (!r.from) { setPrev(null); setPrevLC(null); setPrevLS(null); return } // "todo o período" não compara
    const to = r.to ?? new Date()
    const len = to.getTime() - r.from.getTime()
    const pTo = new Date(r.from.getTime())
    const pFrom = new Date(r.from.getTime() - len)
    const isoDay = (d: Date) => d.toISOString().slice(0, 10)
    let cancel = false
    setPrev(null); setPrevLC(null); setPrevLS(null)

    const untilDay = isoDay(new Date(pTo.getTime() - 86400000))
    fetch(`/api/meta-ads/overview?dateKey=custom&from=${isoDay(pFrom)}&to=${untilDay}`, { cache: 'no-store' })
      .then(r => r.json()).then(d => { if (!cancel && !d.error) setPrev(d) }).catch(() => {})
    const countPrev = async (source: 'meta' | 'site') => {
      const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('source', source).gte('created_at', pFrom.toISOString()).lt('created_at', pTo.toISOString())
      return count ?? 0
    }
    countPrev('meta').then(c => { if (!cancel) setPrevLC(c) }).catch(() => {})
    countPrev('site').then(c => { if (!cancel) setPrevLS(c) }).catch(() => {})
    return () => { cancel = true }
  }, [compare, qs, ready, dateKey, custom])

  const m = ov?.metrics
  const canCompare = dateKey !== 'all' && isAdmin
  const cmpOn = compare && canCompare
  const pm = prev?.metrics

  // Config dos cards do bento (chave = id do layout)
  const cards = m ? [
    card('leads', UserPlus, 'Leads', int(m.leads), 'up', m.leads, pm?.leads, cmpOn, { hero: true, accent: 'var(--ads-acc)' }),
    card('leadsCenter', Inbox, 'Leads Center', leadsCenter == null ? '—' : int(leadsCenter), 'up', leadsCenter ?? 0, prevLC, cmpOn),
    card('leadsSite', Globe, 'Leads Site', leadsSite == null ? '—' : int(leadsSite), 'up', leadsSite ?? 0, prevLS, cmpOn),
    card('spend', DollarSign, 'Investimento', formatBRL(m.spend), 'neutral', m.spend, pm?.spend, cmpOn, { hero: true }),
    card('cpl', Target, 'CPL', formatBRL(m.cpl), 'down', m.cpl, pm?.cpl, cmpOn),
    card('messages', MessageCircle, 'Mensagens', int(m.messages), 'up', m.messages, pm?.messages, cmpOn),
    card('costPerMsg', MessageSquarePlus, 'CP Mensagem', formatBRL(m.costPerMsg), 'down', m.costPerMsg, pm?.costPerMsg, cmpOn),
    card('reach', Users, 'Alcance', int(m.reach), 'up', m.reach, pm?.reach, cmpOn),
    card('impressions', Eye, 'Impressões', int(m.impressions), 'up', m.impressions, pm?.impressions, cmpOn),
    card('clicks', MousePointerClick, 'Cliques', int(m.clicks), 'up', m.clicks, pm?.clicks, cmpOn),
    card('cpc', Coins, 'CPC', formatBRL(m.cpc), 'down', m.cpc, pm?.cpc, cmpOn),
    card('ctr', Percent, 'CTR', pctFmt(m.ctr), 'up', m.ctr, pm?.ctr, cmpOn),
    card('cpm', Gauge, 'CPM', formatBRL(m.cpm), 'down', m.cpm, pm?.cpm, cmpOn),
  ] : []

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h1 className={styles.title}>Meta Ads</h1>
          <p className={styles.subtitle}>Conta Anúncios HealthGo{cmpOn && ' · comparando com período anterior'}</p>
        </div>
        <div className={styles.headActions}>
          <button className={styles.iconBtn} onClick={resetLayout} title="Restaurar layout dos cards"><RotateCcw size={15} /></button>
          {isAdmin && (
            <button
              className={`${styles.compareBtn} ${cmpOn ? styles.compareOn : ''}`}
              onClick={() => setCompare(c => !c)}
              disabled={dateKey === 'all'}
              title={dateKey !== 'all' ? 'Comparar com o período anterior' : 'Selecione um período específico para comparar'}
            >
              <GitCompare size={15} /> Comparar
            </button>
          )}
          <DateRangeDropdown dateKey={dateKey} onDateKey={onDateKey} custom={custom} onCustom={onCustom} />
        </div>
      </div>

      {ovErr ? (
        <div className={styles.errorBox}><TriangleAlert size={16} /> Não foi possível carregar os dados do Meta: {ovErr}</div>
      ) : loadingOv || !m ? (
        <div className={styles.loading}><Loader2 className={styles.spin} size={30} /></div>
      ) : (
        <>
          {/* ===== Cards bento (arrastáveis/redimensionáveis) ===== */}
          <div ref={grid.containerRef} className={styles.gridWrap}>
            {grid.width > 0 && (
              <GridLayout
                className={styles.grid}
                width={grid.width}
                layout={layout}
                onLayoutChange={onLayout}
                gridConfig={{ cols: 12, rowHeight: 76, margin: [12, 12] }}
                dragConfig={{ handle: `.${styles.dragHandle}`, bounded: true }}
                resizeConfig={{ handles: ['s', 'e', 'se', 'n', 'w', 'ne', 'nw', 'sw'] }}
              >
                {cards.map(c => (
                  <div key={c.key} className={styles.gridItem}>
                    <span className={styles.dragHandle} title="Arraste para mover"><GripHorizontal size={14} /></span>
                    {c.node}
                  </div>
                ))}
              </GridLayout>
            )}
          </div>

          {/* ===== Gráficos por dia (linha) ===== */}
          <div className={styles.chartGrid}>
            <LineChart title="Leads por dia" icon={UserPlus} points={ov.daily} field="leads" />
            <LineChart title="Mensagens por dia" icon={MessageSquare} points={ov.daily} field="messages" />
            <LineChart title="Cliques por dia" icon={MousePointerClick} points={ov.daily} field="clicks" />
            <LineChart title="Gasto por dia" icon={TrendingUp} points={ov.daily} field="spend" money />
          </div>

          <Funnel data={ov.funnel} leadsCenter={leadsCenter} leadsSite={leadsSite} />

          <DataTable title="Campanhas" rows={campaigns} storageKey="app-ads-cols-campaign" />
          <DataTable title="Conjuntos" rows={adsets} storageKey="app-ads-cols-adset" />
          <CreativesTable rows={creatives} storageKey="app-ads-cols-ad" onOpen={(id, name) => setOpenAd({ id, name })} />
        </>
      )}

      <CreativeModal adId={openAd?.id ?? null} name={openAd?.name} onClose={() => setOpenAd(null)} />
    </div>
  )
}

// Layout padrão do bento (grade de 12 colunas)
const DEFAULT_LAYOUT: Layout = [
  { i: 'leads', x: 0, y: 0, w: 6, h: 1 },
  { i: 'leadsCenter', x: 6, y: 0, w: 3, h: 1 },
  { i: 'leadsSite', x: 9, y: 0, w: 3, h: 1 },
  { i: 'spend', x: 0, y: 1, w: 6, h: 1 },
  { i: 'cpl', x: 6, y: 1, w: 3, h: 1 },
  { i: 'messages', x: 9, y: 1, w: 3, h: 1 },
  { i: 'costPerMsg', x: 0, y: 2, w: 3, h: 1 },
  { i: 'reach', x: 3, y: 2, w: 3, h: 1 },
  { i: 'impressions', x: 6, y: 2, w: 3, h: 1 },
  { i: 'clicks', x: 9, y: 2, w: 3, h: 1 },
  { i: 'cpc', x: 0, y: 3, w: 3, h: 1 },
  { i: 'ctr', x: 3, y: 3, w: 3, h: 1 },
  { i: 'cpm', x: 6, y: 3, w: 6, h: 1 },
]

type CardOpts = { hero?: boolean; accent?: string }
function card(
  key: string, icon: KpiIcon, label: string, value: string,
  dir: Dir, cur: number, prevVal: number | null | undefined, cmpOn: boolean, opts: CardOpts = {},
): { key: string; node: React.ReactNode } {
  const delta = cmpOn ? deltaFor(cur, prevVal, dir) : null
  return { key, node: <Kpi icon={icon} label={label} value={value} delta={delta} {...opts} /> }
}

// ---------------------------------------------------------------------------
type KpiIcon = React.ComponentType<{ size?: number }>
function Kpi({ icon: Icon, label, value, accent, hero, delta }: {
  icon: KpiIcon; label: string; value: string; accent?: string; hero?: boolean; delta?: Delta | null
}) {
  return (
    <div className={`${styles.kpi} ${hero ? styles.kpiHero : ''}`}>
      <div className={styles.kpiHeadRow}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiIcon}><Icon size={16} /></span>
      </div>
      <div className={styles.kpiValueRow}>
        <span className={styles.kpiValue} style={accent ? { color: accent } : undefined}>{value}</span>
        {delta && (
          <span className={styles.kpiDelta} style={deltaStyle(delta)}>
            {delta.pct >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {Math.abs(delta.pct).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
const fmtDay = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function LineChart({ title, icon: Icon, points, field, money }: {
  title: string; icon: KpiIcon; points: DailyPoint[]
  field: 'leads' | 'messages' | 'clicks' | 'spend'; money?: boolean
}) {
  const vals = points.map(p => p[field])
  const max = Math.max(...vals, 1)
  const total = vals.reduce((a, b) => a + b, 0)
  const n = points.length
  const fmtV = (v: number) => (money ? formatBRL(v) : int(v))
  const [hover, setHover] = useState<number | null>(null)

  const xOf = (i: number) => (n > 1 ? (i / (n - 1)) * 1000 : 500)
  const yOf = (v: number) => 96 - (v / max) * 88
  const xPct = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50)
  const tipTx = (i: number) => { const x = xPct(i); return x <= 12 ? '0' : x >= 88 ? '-100%' : '-50%' }
  const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yOf(p[field]).toFixed(1)}`).join(' ')
  const areaPath = n > 1 ? `${linePath} L1000 100 L0 100 Z` : ''
  const gid = `ln-${field}`

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}><Icon size={15} /><span>{title}</span>
        <span className={styles.cardTotal}>{fmtV(total)}</span>
      </h3>
      {n === 0 ? (
        <div className={styles.cardEmpty}>Sem dados no período.</div>
      ) : (
        <div className={styles.lineWrap} onMouseLeave={() => setHover(null)}>
          <svg className={styles.lineSvg} viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop className={styles.gradTop} offset="0%" />
                <stop className={styles.gradBot} offset="100%" />
              </linearGradient>
            </defs>
            {areaPath && <path d={areaPath} fill={`url(#${gid})`} />}
            <path d={linePath} className={styles.lineStroke} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {hover !== null && (
            <>
              <div className={styles.crosshair} style={{ left: `${xPct(hover)}%` }} />
              <div className={styles.dot} style={{ left: `${xPct(hover)}%`, top: `${yOf(points[hover][field])}%` }} />
              <div className={styles.tip} style={{ left: `${xPct(hover)}%`, transform: `translateX(${tipTx(hover)})` }}>
                <span className={styles.tipDay}>{fmtDay(points[hover].date)}</span>
                <span className={styles.tipVal}>{fmtV(points[hover][field])}</span>
              </div>
            </>
          )}
          <div className={styles.lineHover}>
            {points.map((_, i) => (<div key={i} className={styles.lineHit} onMouseEnter={() => setHover(i)} />))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
const FUNNEL_STAGES: { key: keyof FunnelData; label: string }[] = [
  { key: 'impressions', label: 'Impressões' },
  { key: 'reach', label: 'Alcance' },
  { key: 'clicks', label: 'Cliques' },
  { key: 'leads', label: 'Leads' },
  { key: 'conversations', label: 'Mensagens' },
]
const FUNNEL_INSETS = [0, 6, 13, 20, 27, 33]
const FUNNEL_FILLS = [
  'linear-gradient(180deg,#4f46e5,#4338ca)',
  'linear-gradient(180deg,#6366f1,#4f46e5)',
  'linear-gradient(180deg,#a5b4fc,#818cf8)',
  'linear-gradient(180deg,#c7d2fe,#a5b4fc)',
  'linear-gradient(180deg,#10b981,#047857)',
]
const FUNNEL_DARKTEXT = [false, false, true, true, false]

function Funnel({ data, leadsCenter, leadsSite }: { data: FunnelData; leadsCenter: number | null; leadsSite: number | null }) {
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}><Filter size={15} /><span>Funil de conversão</span></h3>
      <div className={styles.funnel}>
        {FUNNEL_STAGES.map((s, i) => {
          const val = data[s.key]
          const prev = i === 0 ? val : data[FUNNEL_STAGES[i - 1].key]
          const stepPct = prev ? (val / prev) * 100 : 0
          const clip = `polygon(${FUNNEL_INSETS[i]}% 0, ${100 - FUNNEL_INSETS[i]}% 0, ${100 - FUNNEL_INSETS[i + 1]}% 100%, ${FUNNEL_INSETS[i + 1]}% 100%)`
          const isLeads = s.key === 'leads'
          return (
            <div key={s.key} className={styles.funStage}>
              <span className={styles.funStep}>Etapa {i + 1}</span>
              <div className={`${styles.funSeg} ${FUNNEL_DARKTEXT[i] ? styles.funDark : ''} ${isLeads ? styles.funSegTall : ''}`}
                style={{ clipPath: clip, background: FUNNEL_FILLS[i] }}>
                <span className={styles.funName}>{s.label}</span>
                <span className={styles.funValue}>{int(val)}{i > 0 && <span className={styles.funPct}> ({pctFmt(stepPct)})</span>}</span>
                {isLeads && (
                  <span className={styles.funSub}>Central {leadsCenter == null ? '—' : int(leadsCenter)} · Site {leadsSite == null ? '—' : int(leadsSite)}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
type Tone = 'active' | 'off' | 'issue' | 'review'
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Ativo', tone: 'active' },
  PAUSED: { label: 'Pausado', tone: 'off' },
  CAMPAIGN_PAUSED: { label: 'Campanha pausada', tone: 'off' },
  ADSET_PAUSED: { label: 'Conjunto pausado', tone: 'off' },
  ARCHIVED: { label: 'Arquivado', tone: 'off' },
  DELETED: { label: 'Excluído', tone: 'off' },
  WITH_ISSUES: { label: 'Com problemas', tone: 'issue' },
  DISAPPROVED: { label: 'Reprovado', tone: 'issue' },
  PENDING_BILLING_INFO: { label: 'Pend. pagamento', tone: 'issue' },
  PENDING_REVIEW: { label: 'Em análise', tone: 'review' },
  PREAPPROVED: { label: 'Pré-aprovado', tone: 'review' },
  IN_PROCESS: { label: 'Processando', tone: 'review' },
}
function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className={styles.statusNone}>—</span>
  const info = STATUS_MAP[status] ?? { label: status.replace(/_/g, ' ').toLowerCase(), tone: 'off' as Tone }
  return <span className={`${styles.statusPill} ${styles['st_' + info.tone]}`}><span className={styles.statusDot} />{info.label}</span>
}

// ---------------------------------------------------------------------------
// Catálogo de colunas do Meta Ads (para o seletor de colunas).
type SortKey = 'name' | 'status' | 'spend' | 'leads' | 'cpl' | 'messages' | 'costPerMsg'
  | 'reach' | 'frequency' | 'impressions' | 'clicks' | 'linkClicks' | 'ctr' | 'cpc' | 'costPerLinkClick' | 'cpm' | 'cpp'
type ColDef = { key: SortKey; label: string; fmt: (r: TableRow) => string }
const ALL_COLS: ColDef[] = [
  { key: 'spend', label: 'Gasto', fmt: r => formatBRL(r.spend) },
  { key: 'leads', label: 'Leads', fmt: r => int(r.leads) },
  { key: 'cpl', label: 'CPL', fmt: r => formatBRL(r.cpl) },
  { key: 'messages', label: 'Mensagens', fmt: r => int(r.messages) },
  { key: 'costPerMsg', label: 'CP Msg', fmt: r => formatBRL(r.costPerMsg) },
  { key: 'reach', label: 'Alcance', fmt: r => int(r.reach) },
  { key: 'frequency', label: 'Frequência', fmt: r => dec(r.frequency) },
  { key: 'impressions', label: 'Impressões', fmt: r => int(r.impressions) },
  { key: 'clicks', label: 'Cliques', fmt: r => int(r.clicks) },
  { key: 'linkClicks', label: 'Cliques no link', fmt: r => int(r.linkClicks) },
  { key: 'ctr', label: 'CTR', fmt: r => pctFmt(r.ctr) },
  { key: 'cpc', label: 'CPC', fmt: r => formatBRL(r.cpc) },
  { key: 'costPerLinkClick', label: 'CP Clique link', fmt: r => formatBRL(r.costPerLinkClick) },
  { key: 'cpm', label: 'CPM', fmt: r => formatBRL(r.cpm) },
  { key: 'cpp', label: 'CPP', fmt: r => formatBRL(r.cpp) },
]
const DEFAULT_VISIBLE = ['spend', 'leads', 'cpl', 'messages', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm']

function useColumns(storageKey: string): [Set<string>, (k: string) => void] {
  const [visible, setVisible] = useState<Set<string>>(new Set(DEFAULT_VISIBLE))
  useEffect(() => {
    try { const s = localStorage.getItem(storageKey); if (s) setVisible(new Set(JSON.parse(s))) } catch { /* ignora */ }
  }, [storageKey])
  const toggle = (k: string) => setVisible(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k); else n.add(k)
    try { localStorage.setItem(storageKey, JSON.stringify([...n])) } catch { /* ignora */ }
    return n
  })
  return [visible, toggle]
}

function ColumnPicker({ visible, onToggle }: { visible: Set<string>; onToggle: (k: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className={styles.colWrap} ref={ref}>
      <button className={styles.colBtn} onClick={() => setOpen(o => !o)}>
        <SlidersHorizontal size={14} /> Colunas <span className={styles.colCount}>{visible.size}</span>
      </button>
      {open && (
        <div className={styles.colMenu}>
          {ALL_COLS.map(c => {
            const on = visible.has(c.key)
            return (
              <button key={c.key} className={styles.colItem} onClick={() => onToggle(c.key)}>
                <span className={`${styles.colCheck} ${on ? styles.colCheckOn : ''}`}>{on && <Check size={11} strokeWidth={3} />}</span>
                {c.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
type SortState = { key: SortKey; dir: 'asc' | 'desc' }
function useSort(initial: SortKey = 'spend'): [SortState, (k: SortKey) => void] {
  const [sort, setSort] = useState<SortState>({ key: initial, dir: 'desc' })
  const onSort = (k: SortKey) => setSort(s => (s.key === k
    ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' }
    : { key: k, dir: k === 'name' || k === 'status' ? 'asc' : 'desc' }))
  return [sort, onSort]
}
function sortRows<T extends TableRow>(rows: T[], { key, dir }: SortState): T[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[key] as string | number | null
    const bv = b[key] as string | number | null
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul
    return String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR') * mul
  })
}
function Th({ label, sortKey, sort, onSort, num, thClass }: {
  label: string; sortKey: SortKey; sort: SortState; onSort: (k: SortKey) => void; num?: boolean; thClass?: string
}) {
  const active = sort.key === sortKey
  return (
    <th className={`${num ? styles.thNum : ''} ${thClass ?? ''} ${styles.thSort} ${active ? styles.thActive : ''}`} onClick={() => onSort(sortKey)}>
      <span className={styles.thInner}>
        {label}
        {active ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={12} className={styles.thSortIdle} />}
      </span>
    </th>
  )
}

// ---------------------------------------------------------------------------
function DataTable({ title, rows, storageKey }: { title: string; rows: TableRow[] | null; storageKey: string }) {
  const [sort, onSort] = useSort()
  const [visible, toggleCol] = useColumns(storageKey)
  const cols = ALL_COLS.filter(c => visible.has(c.key))
  const sorted = rows ? sortRows(rows, sort) : null
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}><span>{title}</span><div className={styles.cardTools}><ColumnPicker visible={visible} onToggle={toggleCol} /></div></h3>
      {sorted === null ? (
        <div className={styles.tableLoading}><Loader2 className={styles.spin} size={22} /></div>
      ) : sorted.length === 0 ? (
        <div className={styles.cardEmpty}>Nenhum dado no período.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <Th label="Nome" sortKey="name" thClass={styles.thName} sort={sort} onSort={onSort} />
                <Th label="Veiculação" sortKey="status" thClass={styles.thStatus} sort={sort} onSort={onSort} />
                {cols.map(c => <Th key={c.key} label={c.label} sortKey={c.key} num sort={sort} onSort={onSort} />)}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id}>
                  <td className={styles.tdName} title={r.name}>{r.name}</td>
                  <td className={styles.tdStatus}><StatusPill status={r.status} /></td>
                  {cols.map(c => <td key={c.key} className={styles.tdNum}>{c.fmt(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CreativesTable({ rows, storageKey, onOpen }: {
  rows: CreativeRow[] | null; storageKey: string; onOpen: (id: string, name: string) => void
}) {
  const [sort, onSort] = useSort()
  const [visible, toggleCol] = useColumns(storageKey)
  const cols = ALL_COLS.filter(c => visible.has(c.key))
  const sorted = rows ? sortRows(rows, sort) : null
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}><span>Criativos</span><div className={styles.cardTools}><ColumnPicker visible={visible} onToggle={toggleCol} /></div></h3>
      {sorted === null ? (
        <div className={styles.tableLoading}><Loader2 className={styles.spin} size={22} /></div>
      ) : sorted.length === 0 ? (
        <div className={styles.cardEmpty}>Nenhum criativo no período.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thThumb}></th>
                <Th label="Anúncio" sortKey="name" thClass={styles.thName} sort={sort} onSort={onSort} />
                <Th label="Veiculação" sortKey="status" thClass={styles.thStatus} sort={sort} onSort={onSort} />
                {cols.map(c => <Th key={c.key} label={c.label} sortKey={c.key} num sort={sort} onSort={onSort} />)}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} className={styles.creativeRow} onClick={() => onOpen(r.id, r.name)}>
                  <td>
                    <div className={styles.thumb}>
                      {r.thumbnail
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={r.thumbnail} alt="" className={styles.thumbImg} />
                        : <div className={styles.thumbEmpty} />}
                      {r.isVideo && <span className={styles.thumbPlay}><Play size={12} fill="currentColor" /></span>}
                    </div>
                  </td>
                  <td className={styles.tdName} title={r.name}>{r.name}</td>
                  <td className={styles.tdStatus}><StatusPill status={r.status} /></td>
                  {cols.map(c => <td key={c.key} className={styles.tdNum}>{c.fmt(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
