'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, PieChart, GripVertical, TrendingUp, TriangleAlert, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import {
  questionFields, distribution, statusDistribution,
  lossReasonStats, revenueStats, revenueTrend, revenueComparison, type Slice,
} from '@/lib/analytics'
import { getRange, inRange, type DateRangeKey } from '@/lib/dateRange'
import { filtroFormulariosExcluidos } from '@/lib/exclusions'
import { formatBRL } from '@/lib/currency'
import { dedupeLeads } from '@/lib/dedupe'
import DateRangeDropdown from '@/components/leads/DateRangeDropdown'
import { DonutChart, BarChart, TrendChart, StatCard } from './Charts'
import styles from './AnalyticsView.module.css'

const PAGE_SIZE = 1000

const SRC_LABEL: Record<'meta' | 'planilha' | 'site' | 'upload', string> = { meta: 'Meta Ads', planilha: 'Planilhas', site: 'Site', upload: 'Upload' }

const LS_RANGE = 'app-analytics-range'

export default function AnalyticsView({ source }: { source: 'meta' | 'planilha' | 'site' | 'upload' }) {
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  // Período reutiliza o mesmo filtro das abas de leads; persiste entre navegações.
  const [dateKey, setDateKey] = useState<DateRangeKey>('all')
  const [custom, setCustom] = useState({ from: '', to: '' })

  useEffect(() => {
    try {
      const s = localStorage.getItem(LS_RANGE)
      if (s) {
        const parsed = JSON.parse(s)
        if (parsed.dateKey) setDateKey(parsed.dateKey)
        if (parsed.custom) setCustom(parsed.custom)
      }
    } catch { /* ignora */ }
  }, [])

  const persistRange = (key: DateRangeKey, c: { from: string; to: string }) => {
    try { localStorage.setItem(LS_RANGE, JSON.stringify({ dateKey: key, custom: c })) } catch { /* ignora */ }
  }
  const onDateKey = (k: DateRangeKey) => { setDateKey(k); persistRange(k, custom) }
  const onCustom = (c: { from: string; to: string }) => { setCustom(c); persistRange(dateKey, c) }

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const EXCLUIDOS = filtroFormulariosExcluidos()
      const all: Lead[] = []
      let from = 0
      for (;;) {
        const { data, error } = await supabase
          .from('leads').select('*').eq('source', source)
          .not(EXCLUIDOS.coluna, 'in', EXCLUIDOS.valores)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1)
        if (error || !data || data.length === 0) break
        all.push(...data)
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      if (!cancel) { setAllLeads(all); setLoading(false) }
    })()
    return () => { cancel = true }
  }, [source])

  const range = useMemo(() => getRange(dateKey, custom), [dateKey, custom])

  // Linhas brutas no período (para faturamento/perda, que são fatos por linha).
  const rawInRange = useMemo(
    () => allLeads.filter(l => inRange(l.created_at, range)),
    [allLeads, range],
  )

  // Pessoas únicas no período (para distribuições e contagem de status).
  const leads = useMemo(() => {
    const merged = dedupeLeads(allLeads)
    return merged.filter(l => inRange(l.created_at, range))
  }, [allLeads, range])

  const fields = useMemo(() => questionFields(leads), [leads])
  const statusData = useMemo(() => statusDistribution(leads), [leads])
  const backHref = source === 'planilha' ? '/planilhas' : source === 'site' ? '/leads-site' : source === 'upload' ? '/leads-upload' : '/'

  const metrics = useMemo(() => {
    const by = (s: string) => leads.filter(l => l.status === s).length
    const total = leads.length
    const conv = by('convertido')
    return {
      total, novos: by('novo'), contato: by('em_contato'), convertidos: conv,
      taxa: total ? Math.round((conv / total) * 100) : 0,
    }
  }, [leads])

  const revenue = useMemo(() => revenueStats(rawInRange), [rawInRange])
  const trend = useMemo(() => revenueTrend(rawInRange, range), [rawInRange, range])
  const comparison = useMemo(() => revenueComparison(allLeads, range), [allLeads, range])
  const loss = useMemo(() => lossReasonStats(rawInRange), [rawInRange])

  // Cards de gráficos (status + cada pergunta), reordenáveis e persistidos
  type Card = { id: string; title: string; useDonut: boolean; data: Slice[] }
  const allCards = useMemo<Card[]>(() => {
    const list: Card[] = [{ id: '__status__', title: 'Status dos leads', useDonut: true, data: statusData }]
    for (const f of fields) {
      const d = distribution(leads, f)
      if (d.length > 0) list.push({ id: f, title: f, useDonut: d.length <= 4, data: d })
    }
    return list
  }, [fields, statusData, leads])

  const LS = `app-analytics-order-${source}`
  const [order, setOrder] = useState<string[]>([])
  useEffect(() => {
    try { const s = localStorage.getItem(LS); if (s) setOrder(JSON.parse(s)) } catch { /* ignora */ }
  }, [LS])

  const orderedCards = useMemo(() => {
    const byId = new Map(allCards.map(c => [c.id, c]))
    const known = new Set(byId.keys())
    const inOrder = order.filter(id => known.has(id))
    const missing = allCards.map(c => c.id).filter(id => !inOrder.includes(id))
    return [...inOrder, ...missing].map(id => byId.get(id)!).filter(Boolean)
  }, [allCards, order])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = orderedCards.map(c => c.id)
    const next = arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string))
    setOrder(next)
    try { localStorage.setItem(LS, JSON.stringify(next)) } catch { /* ignora */ }
  }

  if (loading) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <Link href={backHref} className={styles.back}><ArrowLeft size={16} /> Voltar</Link>
        <div className={styles.headText}>
          <h1 className={styles.title}>Analytics</h1>
          <p className={styles.subtitle}>{SRC_LABEL[source]}</p>
        </div>
        <DateRangeDropdown dateKey={dateKey} onDateKey={onDateKey} custom={custom} onCustom={onCustom} />
      </div>

      {leads.length === 0 ? (
        <div className={styles.empty}>Nenhum lead nesse período.</div>
      ) : (
        <>
          <div className={styles.statsRow}>
            <StatCard label="Total de leads" value={metrics.total.toLocaleString('pt-BR')} />
            <StatCard label="Convertidos" value={metrics.convertidos.toLocaleString('pt-BR')} accent="#059669" />
            <StatCard label="Taxa de conversão" value={metrics.taxa} unit="%" accent="#059669" />
            <StatCard label="Faturamento" value={formatBRL(revenue.total)} accent="#059669" />
            <StatCard label="Ticket médio" value={revenue.count ? formatBRL(revenue.ticket) : '—'} accent="var(--brand-blue)" />
          </div>

          {/* Faturamento + Motivos de perda (bento) */}
          <div className={styles.grid}>
            <div className={`${styles.card} ${styles.cardSpan2}`}>
              <h3 className={styles.cardTitle}>
                <TrendingUp size={15} />
                <span>Evolução do faturamento</span>
                {comparison && comparison.deltaPct != null && (
                  <span className={`${styles.delta} ${comparison.deltaPct >= 0 ? styles.deltaUp : styles.deltaDown}`}>
                    {comparison.deltaPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {Math.abs(Math.round(comparison.deltaPct))}%
                  </span>
                )}
              </h3>
              <TrendChart points={trend.points} unit={trend.unit} />
              {comparison && (
                <div className={styles.cardNote}>
                  Período anterior: {formatBRL(comparison.previous)}
                </div>
              )}
              {revenue.missing > 0 && (
                <div className={styles.warnNote}>
                  <TriangleAlert size={13} /> {revenue.missing} convertido{revenue.missing > 1 ? 's' : ''} sem valor preenchido (fora da soma)
                </div>
              )}
            </div>

            <div className={styles.card}>
              <h3 className={styles.cardTitle}>
                <BarChart3 size={15} />
                <span>Motivos de perda</span>
              </h3>
              {loss.total === 0 ? (
                <div className={styles.cardEmpty}>Nenhuma perda com motivo registrado no período.</div>
              ) : (
                <>
                  {loss.top && (
                    <div className={styles.highlight}>
                      <span className={styles.highlightLabel}>Motivo #1</span>
                      <span className={styles.highlightValue}>{loss.top.label}</span>
                      <span className={styles.highlightPct}>
                        {loss.total ? Math.round((loss.top.value / loss.total) * 100) : 0}%
                      </span>
                    </div>
                  )}
                  <BarChart data={loss.slices} />
                </>
              )}
              {loss.missing > 0 && (
                <div className={styles.warnNote}>
                  <TriangleAlert size={13} /> {loss.missing} lead{loss.missing > 1 ? 's' : ''} sem motivo registrado
                </div>
              )}
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={orderedCards.map(c => c.id)} strategy={rectSortingStrategy}>
              <div className={styles.grid}>
                {orderedCards.map(card => (
                  <SortableCard key={card.id} id={card.id} title={card.title} useDonut={card.useDonut}>
                    {card.useDonut ? <DonutChart data={card.data} /> : <BarChart data={card.data} />}
                  </SortableCard>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  )
}

function SortableCard({ id, title, useDonut, children }: {
  id: string; title: string; useDonut: boolean; children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 2 : undefined }
  return (
    <div ref={setNodeRef} style={style} className={styles.card}>
      <h3 className={styles.cardTitle}>
        {useDonut ? <PieChart size={15} /> : <BarChart3 size={15} />}
        <span>{title}</span>
        <button className={styles.dragHandle} {...attributes} {...listeners} aria-label="Reordenar">
          <GripVertical size={15} />
        </button>
      </h3>
      {children}
    </div>
  )
}
