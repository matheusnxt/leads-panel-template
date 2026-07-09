'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Columns3, ChevronDown, Check, ChevronLeft, ChevronRight,
  ChevronUp, GripVertical, Loader2, ArrowUpDown,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Lead } from '@/lib/supabase'
import { loadColumnConfig, saveOwnConfig, saveGlobalConfig, type ColumnConfig } from '@/lib/viewSettings'
import { scoreLead } from '@/lib/leadScore'
import { logActivity } from '@/lib/activity'
import ScoreGauge from './ScoreGauge'
import LeadModal from './LeadModal'
import styles from './LeadListView.module.css'

const PAGE_SIZE = 25

const STATUS_LABELS: Record<Lead['status'], string> = {
  novo: 'Novo', em_contato: 'Em Contato', convertido: 'Convertido', perdido: 'Perdido',
}

type BaseCol = { id: string; label: string; render: (l: Lead) => React.ReactNode }
const BASE_COLUMNS: BaseCol[] = [
  { id: 'score',      label: 'Score',      render: l => <ScoreGauge result={scoreLead(l)} size={32} /> },
  { id: 'name',       label: 'Nome',       render: l => {
      const c = (l as { conversions?: number }).conversions ?? 1
      return (
        <span className={styles.nameWrap}>
          <span className={styles.name}>{l.name || '—'}</span>
          {c > 1 && <span className={styles.convBadge} title={`${c} conversões`}>×{c}</span>}
        </span>
      )
    } },
  { id: 'responsible', label: 'Responsável', render: l => l.responsible || '—' },
  { id: 'conversions', label: 'Conversões', render: l => (l as { conversions?: number }).conversions ?? 1 },
  { id: 'phone',      label: 'Telefone',   render: l => l.phone || '—' },
  { id: 'email',      label: 'E-mail',     render: l => l.email || '—' },
  { id: 'form_name',  label: 'Formulário', render: l => l.form_name || '—' },
  { id: 'status',     label: 'Status',     render: l => (
      <span className={`${styles.badge} ${styles[l.status]}`}>{STATUS_LABELS[l.status]}</span>) },
  { id: 'created_at', label: 'Data',       render: l => new Date(l.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) },
  { id: 'platform',   label: 'Plataforma', render: l => l.platform || '—' },
  { id: 'campaign',   label: 'Campanha',   render: l => l.campaign || '—' },
  { id: 'adset',      label: 'Conjunto',   render: l => l.adset || '—' },
  { id: 'ad_name',    label: 'Anúncio',    render: l => l.ad_name || '—' },
]
const BASE_IDS = BASE_COLUMNS.map(c => c.id)
// Colunas visíveis por padrão (as de UTM ficam disponíveis mas ocultas)
const DEFAULT_VISIBLE_IDS = ['score', 'name', 'responsible', 'phone', 'email', 'form_name', 'status', 'created_at']

// Valor comparável de um lead para uma coluna (número ou string)
function sortValue(colId: string, l: Lead): number | string {
  if (colId === 'score') return scoreLead(l)?.score ?? -1
  if (colId === 'created_at') return new Date(l.created_at).getTime()
  if (colId === 'conversions') return (l as { conversions?: number }).conversions ?? 1
  if (colId.startsWith('q:')) return (l.custom_questions?.[colId.slice(2)] || '').toLowerCase()
  const v = (l as unknown as Record<string, unknown>)[colId]
  return typeof v === 'string' ? v.toLowerCase() : ''
}

type Props = { leads: Lead[]; allLeads?: Lead[]; size?: 'sm' | 'md' | 'lg'; source: 'meta' | 'planilha' | 'site'; isAdmin?: boolean; fill?: boolean }

export default function LeadListView({ leads, allLeads, size = 'md', source, isAdmin, fill }: Props) {
  const [selected, setSelected] = useState<Lead | null>(null)
  // Lookup por id p/ abrir cards anteriores da mesma pessoa (mesmo se filtrados fora da lista).
  const byId = useMemo(() => new Map((allLeads ?? leads).map(l => [l.id, l])), [allLeads, leads])
  const openById = (id: string) => { const l = byId.get(id); if (l) setSelected(l) }
  const [page, setPage] = useState(1)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Colunas disponíveis = base + perguntas distintas dos leads
  const allColumns = useMemo(() => {
    const keys = new Set<string>()
    for (const l of leads) for (const k of Object.keys(l.custom_questions ?? {})) keys.add(k)
    const custom: BaseCol[] = [...keys].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(q => ({
      id: `q:${q}`, label: q, render: (l: Lead) => l.custom_questions?.[q] || '—',
    }))
    return [...BASE_COLUMNS, ...custom]
  }, [leads])
  const colById = useMemo(() => new Map(allColumns.map(c => [c.id, c])), [allColumns])

  // Estado de ordem + ocultas
  const [order, setOrder] = useState<string[]>(BASE_IDS)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [savingGlobal, setSavingGlobal] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const loadedRef = useRef(false)

  // Carrega a config (própria → global → builtin) uma vez
  useEffect(() => {
    let cancel = false
    ;(async () => {
      const cfg = await loadColumnConfig(source)
      if (cancel) return
      const allIds = allColumns.map(c => c.id)
      const reconciled = reconcile(allIds, cfg)
      setOrder(reconciled.order)
      setHidden(reconciled.hidden)
      loadedRef.current = true
    })()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  // Reconcilia quando surgem novas colunas (novas perguntas) após o load
  useEffect(() => {
    if (!loadedRef.current) return
    const allIds = allColumns.map(c => c.id)
    setOrder(prev => {
      const known = new Set(allIds)
      const kept = prev.filter(id => known.has(id))
      const missing = allIds.filter(id => !kept.includes(id))
      if (missing.length === 0 && kept.length === prev.length) return prev
      setHidden(h => { const n = new Set(h); missing.forEach(id => n.add(id)); return n })
      return [...kept, ...missing]
    })
  }, [allColumns])

  const persistOwn = (nextOrder: string[], nextHidden: Set<string>) => {
    if (!loadedRef.current) return
    saveOwnConfig(source, { order: nextOrder, hidden: [...nextHidden] })
  }

  const visibleColumns = useMemo(
    () => order.map(id => colById.get(id)).filter((c): c is BaseCol => !!c && !hidden.has(c.id)),
    [order, hidden, colById],
  )

  useEffect(() => {
    const h = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => { setPage(1) }, [leads, sort])

  // Ordena pela coluna selecionada (senão mantém a ordem recebida)
  const sortedLeads = useMemo(() => {
    if (!sort) return leads
    const { col, dir } = sort
    const mul = dir === 'asc' ? 1 : -1
    return [...leads].sort((a, b) => {
      const va = sortValue(col, a), vb = sortValue(col, b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul
      return String(va).localeCompare(String(vb), 'pt-BR') * mul
    })
  }, [leads, sort])

  const totalPages = Math.max(1, Math.ceil(sortedLeads.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageLeads = sortedLeads.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Cabeçalho: 1º clique asc, 2º desc, 3º remove a ordenação
  const toggleSort = (col: string) => {
    setSort(prev => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return null
    })
  }

  const toggleColumn = (id: string) => {
    setHidden(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      persistOwn(order, n)
      return n
    })
  }
  const move = (id: string, dir: -1 | 1) => {
    setOrder(prev => {
      const i = prev.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = arrayMove(prev, i, j)
      persistOwn(next, hidden)
      return next
    })
  }
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setOrder(prev => {
      const next = arrayMove(prev, prev.indexOf(active.id as string), prev.indexOf(over.id as string))
      persistOwn(next, hidden)
      return next
    })
  }
  const resetDefault = () => {
    const r = reconcile(allColumns.map(c => c.id), null)
    setOrder(r.order); setHidden(r.hidden)
    persistOwn(r.order, r.hidden)
  }
  const saveForEveryone = async () => {
    setSavingGlobal(true); setSavedMsg(null)
    const err = await saveGlobalConfig(source, { order, hidden: [...hidden] })
    setSavingGlobal(false)
    setSavedMsg(err ? `Erro: ${err}` : 'Padrão salvo para todos!')
    setTimeout(() => setSavedMsg(null), 3000)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  return (
    <div className={fill ? styles.fillCol : styles.normalCol}>
      <div className={styles.toolbar}>
        <div className={styles.picker} ref={pickerRef}>
          <button className={styles.pickerBtn} onClick={() => setPickerOpen(o => !o)}>
            <Columns3 size={15} strokeWidth={1.75} />
            <span>Colunas ({visibleColumns.length})</span>
            <ChevronDown size={14} className={pickerOpen ? styles.chevOpen : ''} />
          </button>
          {pickerOpen && (
            <div className={styles.pickerMenu}>
              <div className={styles.pickerActions}>
                <button onClick={resetDefault}>Restaurar padrão</button>
              </div>
              <div className={styles.pickerHint}>Arraste, ou use ↑↓, para reordenar</div>
              <div className={styles.pickerList}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={order} strategy={verticalListSortingStrategy}>
                    {order.map((id, idx) => {
                      const col = colById.get(id)
                      if (!col) return null
                      return (
                        <SortableRow
                          key={id} id={id} label={col.label}
                          checked={!hidden.has(id)}
                          onToggle={() => toggleColumn(id)}
                          onUp={() => move(id, -1)}
                          onDown={() => move(id, 1)}
                          isFirst={idx === 0}
                          isLast={idx === order.length - 1}
                        />
                      )
                    })}
                  </SortableContext>
                </DndContext>
              </div>
              {isAdmin && (
                <div className={styles.pickerFooter}>
                  <button className={styles.saveGlobal} onClick={saveForEveryone} disabled={savingGlobal}>
                    {savingGlobal ? <><Loader2 size={13} className={styles.spin} /> Salvando…</> : 'Salvar como padrão para todos'}
                  </button>
                </div>
              )}
              {savedMsg && <div className={styles.savedMsg}>{savedMsg}</div>}
            </div>
          )}
        </div>
      </div>

      <div className={styles.wrapper} data-size={size}>
        <table className={styles.table}>
          <thead>
            <tr>
              {visibleColumns.map(col => {
                const active = sort?.col === col.id
                return (
                  <th key={col.id} onClick={() => toggleSort(col.id)} className={styles.sortableTh}>
                    <span className={styles.thInner}>
                      {col.label}
                      <ArrowUpDown
                        size={12}
                        className={`${styles.sortIcon} ${active ? styles.sortActive : ''}`}
                        style={active && sort?.dir === 'asc' ? { transform: 'scaleY(-1)' } : undefined}
                      />
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageLeads.map(lead => (
              <tr key={lead.id} className={styles.row} onClick={() => { setSelected(lead); logActivity(`abriu o lead "${lead.name || 'sem nome'}"`) }}>
                {visibleColumns.map(col => <td key={col.id}>{col.render(lead)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />}
      {selected && <LeadModal lead={selected} onClose={() => setSelected(null)} onOpenLead={openById} />}
    </div>
  )
}

// Reconcilia uma config salva (ou null = builtin) com as colunas existentes
function reconcile(allIds: string[], config: ColumnConfig | null): { order: string[]; hidden: Set<string> } {
  if (!config) {
    const visible = DEFAULT_VISIBLE_IDS.filter(id => allIds.includes(id))
    const rest = allIds.filter(id => !visible.includes(id))
    return { order: [...visible, ...rest], hidden: new Set(rest) }
  }
  const known = new Set(allIds)
  const order = config.order.filter(id => known.has(id))
  const missing = allIds.filter(id => !order.includes(id))
  const hidden = new Set<string>([...config.hidden.filter(id => known.has(id)), ...missing])
  return { order: [...order, ...missing], hidden }
}

function SortableRow({ id, label, checked, onToggle, onUp, onDown, isFirst, isLast }: {
  id: string; label: string; checked: boolean
  onToggle: () => void; onUp: () => void; onDown: () => void; isFirst: boolean; isLast: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className={styles.colRow}>
      <button className={styles.dragHandle} {...attributes} {...listeners} aria-label="Arrastar">
        <GripVertical size={14} />
      </button>
      <button className={styles.colToggle} onClick={onToggle}>
        <span className={`${styles.checkbox} ${checked ? styles.checkboxOn : ''}`}>
          {checked && <Check size={12} strokeWidth={3} />}
        </span>
        <span className={styles.pickerItemLabel}>{label}</span>
      </button>
      <div className={styles.moveBtns}>
        <button onClick={onUp} disabled={isFirst} aria-label="Subir"><ChevronUp size={14} /></button>
        <button onClick={onDown} disabled={isLast} aria-label="Descer"><ChevronDown size={14} /></button>
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void
}) {
  const pages: (number | '…')[] = []
  const w = 1
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - w && i <= page + w)) pages.push(i)
    else if (pages[pages.length - 1] !== '…') pages.push('…')
  }
  return (
    <div className={styles.pagination}>
      <button className={styles.pageNav} disabled={page === 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={16} />
      </button>
      {pages.map((p, i) => p === '…'
        ? <span key={`e${i}`} className={styles.ellipsis}>…</span>
        : <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageActive : ''}`} onClick={() => onChange(p)}>{p}</button>)}
      <button className={styles.pageNav} disabled={page === totalPages} onClick={() => onChange(page + 1)}>
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
