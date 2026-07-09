'use client'

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { ArrowUpNarrowWide, ArrowDownWideNarrow } from 'lucide-react'
import type { Lead } from '@/lib/supabase'
import { scoreLead } from '@/lib/leadScore'
import { logActivity } from '@/lib/activity'
import ScoreGauge from './ScoreGauge'
import LeadModal from './LeadModal'
import styles from './LeadKanbanView.module.css'

const COLUMNS: { id: Lead['status']; label: string; color: string }[] = [
  { id: 'novo',        label: 'Novo',        color: '#5CA0D9' },
  { id: 'em_contato',  label: 'Em Contato',  color: '#d97706' },
  { id: 'convertido',  label: 'Convertido',  color: '#059669' },
  { id: 'perdido',     label: 'Perdido',     color: '#dc2626' },
]

function LeadCard({ lead, onClick }: { lead: Lead; onClick?: () => void }) {
  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.cardTop}>
        <ScoreGauge result={scoreLead(lead)} size={36} />
        <div className={styles.cardInfo}>
          <div className={styles.cardName}>
            {lead.name}
            {((lead as { conversions?: number }).conversions ?? 1) > 1 && (
              <span className={styles.convBadge}>×{(lead as { conversions?: number }).conversions}</span>
            )}
          </div>
          {lead.phone && <div className={styles.cardMeta}>{lead.phone}</div>}
          {lead.email && <div className={styles.cardMeta}>{lead.email}</div>}
        </div>
      </div>
      {lead.form_name && <div className={styles.cardTag}>{lead.form_name}</div>}
      <div className={styles.cardDate}>
        {new Date(lead.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

function DraggableCard({ lead, onClick }: { lead: Lead; onClick: (l: Lead) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${styles.draggable} ${isDragging ? styles.dragging : ''}`}
    >
      <LeadCard lead={lead} onClick={() => onClick(lead)} />
    </div>
  )
}

function KanbanColumn({
  id, label, color, leads, onCardClick,
}: {
  id: string
  label: string
  color: string
  leads: Lead[]
  onCardClick: (l: Lead) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div ref={setNodeRef} className={`${styles.column} ${isOver ? styles.columnOver : ''}`}>
      <div className={styles.columnHeader}>
        <div className={styles.dot} style={{ background: color }} />
        <span className={styles.columnLabel}>{label}</span>
        <span className={styles.columnCount}>{leads.length}</span>
      </div>
      <div className={styles.cards}>
        {leads.map(lead => (
          <DraggableCard key={lead.id} lead={lead} onClick={onCardClick} />
        ))}
      </div>
    </div>
  )
}

type Props = {
  leads: Lead[]
  allLeads?: Lead[]
  onStatusChange: (id: string, status: Lead['status']) => void
  fill?: boolean
}

const SORT_FIELDS: { key: string; label: string }[] = [
  { key: 'created_at', label: 'Data' },
  { key: 'score', label: 'Score' },
  { key: 'name', label: 'Nome' },
]

function kanbanSortValue(field: string, l: Lead): number | string {
  if (field === 'score') return scoreLead(l)?.score ?? -1
  if (field === 'name') return (l.name || '').toLowerCase()
  return new Date(l.created_at).getTime()
}

export default function LeadKanbanView({ leads, allLeads, onStatusChange, fill }: Props) {
  const [activeId, setActiveId]       = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  // Lookup por id p/ abrir cards anteriores da mesma pessoa (mesmo se filtrados fora).
  const openById = (id: string) => { const l = (allLeads ?? leads).find(x => x.id === id); if (l) setSelectedLead(l) }
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const activeLead = leads.find(l => l.id === activeId) ?? null

  const sortLeads = (arr: Lead[]) => {
    const mul = sortDir === 'asc' ? 1 : -1
    return [...arr].sort((a, b) => {
      const va = kanbanSortValue(sortField, a), vb = kanbanSortValue(sortField, b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul
      return String(va).localeCompare(String(vb), 'pt-BR') * mul
    })
  }

  // Só inicia o arrasto após mover 8px — assim um clique simples abre o modal
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return
    const lead = leads.find(l => l.id === active.id)
    if (!lead || lead.status === over.id) return
    onStatusChange(lead.id, over.id as Lead['status'])
  }

  return (
    <div className={fill ? styles.fillCol : undefined}>
      <div className={styles.sortBar}>
        <span className={styles.sortLabel}>Ordenar por</span>
        <select className={styles.sortSelect} value={sortField} onChange={e => setSortField(e.target.value)}>
          {SORT_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <button
          className={styles.sortDirBtn}
          onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
          title={sortDir === 'asc' ? 'Crescente' : 'Decrescente'}
        >
          {sortDir === 'asc' ? <ArrowUpNarrowWide size={15} /> : <ArrowDownWideNarrow size={15} />}
          {sortDir === 'asc' ? 'Crescente' : 'Decrescente'}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className={fill ? styles.boardScroll : undefined}>
        <div className={styles.board}>
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              label={col.label}
              color={col.color}
              leads={sortLeads(leads.filter(l => l.status === col.id))}
              onCardClick={(l) => { setSelectedLead(l); logActivity(`abriu o lead "${l.name || 'sem nome'}"`) }}
            />
          ))}
        </div>
        </div>

        <DragOverlay>
          {activeLead ? (
            <div className={styles.overlay}>
              <LeadCard lead={activeLead} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedLead && (
        <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} onOpenLead={openById} />
      )}
    </div>
  )
}
