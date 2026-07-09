'use client'

import { useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import { useView } from '@/contexts/ViewContext'
import { useSession } from '@/contexts/SessionContext'
import { getRange, inRange, type DateRangeKey } from '@/lib/dateRange'
import { scoreLead } from '@/lib/leadScore'
import { dedupeLeads, CONVERSION_WINDOW_DAYS } from '@/lib/dedupe'
import { buildExport, download, uploadExport, type ExportFormat } from '@/lib/export'
import { logActivity } from '@/lib/activity'
import FilterBar from './FilterBar'
import LeadListView from './LeadListView'
import LeadKanbanView from './LeadKanbanView'
import styles from './LeadsPage.module.css'

const PAGE_SIZE = 1000

export type LeadSource = 'meta' | 'planilha' | 'site'
const SOURCE_LABEL: Record<LeadSource, string> = { meta: 'Meta Ads', planilha: 'Planilhas', site: 'Site' }

type Props = {
  source?: LeadSource
  emptyState?: React.ReactNode
  fillHeight?: boolean
}

export default function LeadsPage({ source = 'meta', emptyState, fillHeight = true }: Props) {
  const { view, search } = useView()
  const { profile } = useSession()
  const isAdmin = profile?.role === 'adm'
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedForms, setSelectedForms] = useState<string[]>([])
  const [sortAsc, setSortAsc] = useState(false) // false = mais recentes primeiro
  const [dateKey, setDateKey] = useState<DateRangeKey>('all')
  const [customRange, setCustomRange] = useState({ from: '', to: '' })
  const [bands, setBands] = useState<string[]>([])
  const [listSize, setListSize] = useState<'sm' | 'md' | 'lg'>('md')

  useEffect(() => {
    const s = localStorage.getItem('app-list-size')
    if (s === 'sm' || s === 'md' || s === 'lg') setListSize(s)
  }, [])
  const changeListSize = (s: 'sm' | 'md' | 'lg') => {
    setListSize(s)
    try { localStorage.setItem('app-list-size', s) } catch { /* ignora */ }
  }

  // Busca todos os leads paginando (Supabase limita 1000 por requisição)
  const fetchLeads = async () => {
    const all: Lead[] = []
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('source', source)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error || !data || data.length === 0) break
      all.push(...data)
      if (data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
    setLeads(all)
    setLoading(false)
  }

  const STATUS_LABELS: Record<Lead['status'], string> = {
    novo: 'Novo', em_contato: 'Em Contato', convertido: 'Convertido', perdido: 'Perdido',
  }
  const updateLeadStatus = async (id: string, status: Lead['status']) => {
    const lead = leads.find(l => l.id === id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    await supabase.from('leads').update({ status }).eq('id', id)
    logActivity(`moveu o card de "${lead?.name || 'lead'}" para "${STATUS_LABELS[status]}"`)
  }

  useEffect(() => {
    fetchLeads()
    const channel = supabase
      .channel(`leads-realtime-${source}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchLeads)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  // Agrupa leads iguais (mesma pessoa) numa única entrada. Reconversões
  // separadas por mais que a janela (30d) viram cards distintos (regra HealthGo).
  const mergedLeads = useMemo(() => dedupeLeads(leads, CONVERSION_WINDOW_DAYS), [leads])

  // Lista de formulários distintos (por quantas pessoas converteram por ele)
  const forms = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of mergedLeads) {
      for (const f of (l.forms.length ? l.forms : ['Sem formulário'])) {
        counts.set(f, (counts.get(f) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f)
  }, [mergedLeads])

  // Aplica filtro de formulário + data + busca por texto + ordenação por data
  const visibleLeads = useMemo(() => {
    let result = mergedLeads
    if (selectedForms.length > 0) {
      const set = new Set(selectedForms)
      result = result.filter(l => (l.forms.length ? l.forms : ['Sem formulário']).some(f => set.has(f)))
    }
    if (dateKey !== 'all') {
      const range = getRange(dateKey, customRange)
      result = result.filter(l => inRange(l.created_at, range))
    }
    if (bands.length > 0) {
      const set = new Set(bands)
      result = result.filter(l => {
        const r = scoreLead(l)
        if (!r) return false
        if (set.has(r.band)) return true
        if (set.has('star') && r.star) return true
        return false
      })
    }
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter(l => {
        const haystack = [
          l.name, l.email, l.phone, l.form_name,
          ...Object.values(l.custom_questions ?? {}),
        ].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(q)
      })
    }
    return [...result].sort((a, b) => {
      const da = new Date(a.created_at).getTime()
      const db = new Date(b.created_at).getTime()
      return sortAsc ? da - db : db - da
    })
  }, [leads, selectedForms, sortAsc, search, dateKey, customRange, bands])

  const toggleForm = (form: string) =>
    setSelectedForms(prev =>
      prev.includes(form) ? prev.filter(f => f !== form) : [...prev, form])

  const handleExport = async (format: ExportFormat) => {
    const { blob, name } = buildExport(visibleLeads, format, source)
    download(blob, name)
    const url = await uploadExport(blob, name).catch(() => null)
    const fmtLabel = format === 'xlsx' ? 'Excel' : format.toUpperCase()
    await logActivity(`exportou ${visibleLeads.length} leads em ${fmtLabel} (${SOURCE_LABEL[source]})`, url)
  }

  if (loading) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>
  }

  if (leads.length === 0) {
    if (emptyState) return <>{emptyState}</>
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}><Users size={28} strokeWidth={1.5} /></div>
        <h2 className={styles.emptyTitle}>Nenhum lead ainda</h2>
        <p className={styles.emptyText}>
          Quando os seus anúncios do Meta Ads gerarem leads, eles aparecerão aqui em tempo real.
        </p>
        <div className={styles.emptyHint}>
          Configure o webhook em <code>/api/webhook/meta</code>
        </div>
      </div>
    )
  }

  return (
    <div className={fillHeight ? styles.fill : undefined}>
      <div className={styles.stickyBar}>
        <FilterBar
          forms={forms}
          selectedForms={selectedForms}
          onToggleForm={toggleForm}
          onClearForms={() => setSelectedForms([])}
          sortAsc={sortAsc}
          onToggleSort={() => setSortAsc(s => !s)}
          total={visibleLeads.length}
          dateKey={dateKey}
          onDateKey={setDateKey}
          custom={customRange}
          onCustom={setCustomRange}
          bands={bands}
          onToggleBand={(b) => setBands(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}
          onExport={handleExport}
          source={source}
          listSize={listSize}
          onListSize={changeListSize}
          showSize={view === 'list'}
        />
      </div>
      {view === 'list'
        ? <LeadListView leads={visibleLeads} allLeads={mergedLeads} size={listSize} source={source} isAdmin={isAdmin} fill={fillHeight} />
        : <LeadKanbanView leads={visibleLeads} allLeads={mergedLeads} onStatusChange={updateLeadStatus} fill={fillHeight} />}
    </div>
  )
}
