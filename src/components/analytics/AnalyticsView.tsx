'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, PieChart, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import { questionFields, distribution, statusDistribution, type Slice } from '@/lib/analytics'
import { dedupeLeads } from '@/lib/dedupe'
import { DonutChart, BarChart, StatCard } from './Charts'
import styles from './AnalyticsView.module.css'

const PAGE_SIZE = 1000

const PERIODS: { key: string; label: string; days: number | null }[] = [
  { key: 'all', label: 'Tudo', days: null },
  { key: '30', label: '30 dias', days: 30 },
  { key: '90', label: '3 meses', days: 90 },
  { key: '365', label: '12 meses', days: 365 },
]

const SRC_LABEL: Record<'meta' | 'planilha' | 'site', string> = { meta: 'Meta Ads', planilha: 'Planilhas', site: 'Site' }

export default function AnalyticsView({ source }: { source: 'meta' | 'planilha' | 'site' }) {
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('all')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const all: Lead[] = []
      let from = 0
      for (;;) {
        const { data, error } = await supabase
          .from('leads').select('*').eq('source', source)
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

  const leads = useMemo(() => {
    const merged = dedupeLeads(allLeads) // pessoas únicas
    const days = PERIODS.find(p => p.key === period)?.days
    if (!days) return merged
    const cutoff = Date.now() - days * 86400000
    return merged.filter(l => new Date(l.created_at).getTime() >= cutoff)
  }, [allLeads, period])

  const fields = useMemo(() => questionFields(leads), [leads])
  const statusData = useMemo(() => statusDistribution(leads), [leads])
  const backHref = source === 'planilha' ? '/planilhas' : source === 'site' ? '/leads-site' : '/'

  const metrics = useMemo(() => {
    const by = (s: string) => leads.filter(l => l.status === s).length
    const total = leads.length
    const conv = by('convertido')
    return {
      total,
      novos: by('novo'),
      contato: by('em_contato'),
      convertidos: conv,
      taxa: total ? Math.round((conv / total) * 100) : 0,
    }
  }, [leads])

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
        <div className={styles.segmented}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              className={`${styles.segBtn} ${period === p.key ? styles.segActive : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {leads.length === 0 ? (
        <div className={styles.empty}>Nenhum lead nesse período.</div>
      ) : (
        <>
          <div className={styles.statsRow}>
            <StatCard label="Total de leads" value={metrics.total.toLocaleString('pt-BR')} />
            <StatCard label="Novos" value={metrics.novos.toLocaleString('pt-BR')} accent="var(--brand-blue)" />
            <StatCard label="Em contato" value={metrics.contato.toLocaleString('pt-BR')} accent="#d97706" />
            <StatCard label="Convertidos" value={metrics.convertidos.toLocaleString('pt-BR')} accent="#059669" />
            <StatCard label="Taxa de conversão" value={metrics.taxa} unit="%" accent="#059669" />
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
