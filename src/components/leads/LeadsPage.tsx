'use client'

import { useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/lib/supabase'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useView } from '@/contexts/ViewContext'
import { useSession } from '@/contexts/SessionContext'
import { getRange, inRange, type DateRangeKey } from '@/lib/dateRange'
import { scoreLead } from '@/lib/leadScore'
import { dedupeLeads, CONVERSION_WINDOW_DAYS } from '@/lib/dedupe'
import { filtroFormulariosExcluidos } from '@/lib/exclusions'
import { buildExport, download, uploadExport, type ExportFormat } from '@/lib/export'
import { logActivity } from '@/lib/activity'
import { logLeadActivity } from '@/lib/leadActivity'
import FilterBar from './FilterBar'
import LeadListView from './LeadListView'
import LeadKanbanView from './LeadKanbanView'
import styles from './LeadsPage.module.css'

const PAGE_SIZE = 1000

export type LeadSource = 'meta' | 'planilha' | 'site' | 'upload'
const SOURCE_LABEL: Record<LeadSource, string> = { meta: 'Meta Ads', planilha: 'Planilhas', site: 'Site', upload: 'Upload' }

type Props = {
  source?: LeadSource
  /**
   * Origens realmente consultadas. Ausente = apenas `source`.
   * A aba Planilhas usa ['planilha','upload'] para mostrar as duas bases
   * juntas sem migrar nada no banco — cada lead mantém sua origem.
   */
  sources?: LeadSource[]
  emptyState?: React.ReactNode
  fillHeight?: boolean
}

export default function LeadsPage({ source = 'meta', sources, emptyState, fillHeight = true }: Props) {
  // Memoizado por valor: um array novo a cada render reiniciaria a busca.
  const origens = useMemo(() => sources ?? [source], [sources, source])
  const chaveOrigens = origens.join(',')
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
    const EXCLUIDOS = filtroFormulariosExcluidos()
    const all: Lead[] = []
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .in('source', origens)
        .not(EXCLUIDOS.coluna, 'in', EXCLUIDOS.valores)
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
    const from = lead?.status
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    await supabase.from('leads').update({ status }).eq('id', id)
    logActivity(`moveu o card de "${lead?.name || 'lead'}" para "${STATUS_LABELS[status]}"`)
    if (from && from !== status) logLeadActivity(id, 'stage_change', { fromStage: from, toStage: status })
  }

  // Mover para Convertido (ou preencher card legado): grava valor + status.
  const convertLead = async (id: string, value: number, fromStage: Lead['status']) => {
    const lead = leads.find(l => l.id === id)
    const moved = fromStage !== 'convertido'
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: 'convertido', conversion_value: value } : l))
    await supabase.from('leads').update({ status: 'convertido', conversion_value: value }).eq('id', id)
    if (moved) {
      logActivity(`moveu o card de "${lead?.name || 'lead'}" para "Convertido"`)
      logLeadActivity(id, 'stage_change', { fromStage, toStage: 'convertido' })
    }
    logLeadActivity(id, 'conversion_value', { metadata: { value } })
  }

  // Mover para Perdido (ou preencher card legado): grava motivo + status.
  const loseLead = async (id: string, reason: string, note: string | null, fromStage: Lead['status']) => {
    const lead = leads.find(l => l.id === id)
    const moved = fromStage !== 'perdido'
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: 'perdido', loss_reason: reason, loss_reason_note: note } : l))
    await supabase.from('leads').update({ status: 'perdido', loss_reason: reason, loss_reason_note: note }).eq('id', id)
    if (moved) {
      logActivity(`moveu o card de "${lead?.name || 'lead'}" para "Perdido"`)
      logLeadActivity(id, 'stage_change', { fromStage, toStage: 'perdido' })
    }
    logLeadActivity(id, 'loss_reason', { metadata: { reason, note } })
  }

  useEffect(() => {
    fetchLeads()

    // Aplica cada mudança do realtime direto no estado local (uma linha por
    // vez), em vez de re-buscar todos os ~2k leads a cada evento. Também evita
    // que os nossos próprios updates otimistas disparem um refetch completo.
    const applyChange = (payload: RealtimePostgresChangesPayload<Lead & { source: string }>) => {
      if (payload.eventType === 'DELETE') {
        const id = (payload.old as { id?: string }).id
        if (id) setLeads(prev => prev.filter(l => l.id !== id))
        return
      }
      const row = payload.new
      // INSERT/UPDATE de outra origem: ignora (ou remove, se mudou de origem)
      if (!origens.includes(row.source as LeadSource)) {
        setLeads(prev => prev.some(l => l.id === row.id) ? prev.filter(l => l.id !== row.id) : prev)
        return
      }
      setLeads(prev => {
        const idx = prev.findIndex(l => l.id === row.id)
        if (idx === -1) return [row, ...prev] // INSERT (mais recente primeiro)
        const next = [...prev]                // UPDATE
        next[idx] = row
        return next
      })
    }

    const channel = supabase
      .channel(`leads-realtime-${chaveOrigens}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, applyChange)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveOrigens])

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
        : <LeadKanbanView leads={visibleLeads} allLeads={mergedLeads} onStatusChange={updateLeadStatus} onConvert={convertLead} onLose={loseLead} fill={fillHeight} />}
    </div>
  )
}
