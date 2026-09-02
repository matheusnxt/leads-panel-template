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
import { ArrowUpNarrowWide, ArrowDownWideNarrow, History, CircleDollarSign, TriangleAlert } from 'lucide-react'
import type { Lead } from '@/lib/supabase'
import { scoreLead } from '@/lib/leadScore'
import { logActivity } from '@/lib/activity'
import { formatBRL } from '@/lib/currency'
import ScoreGauge from './ScoreGauge'
import LeadModal from './LeadModal'
import ConversionValueModal from './ConversionValueModal'
import LossReasonModal from './LossReasonModal'
import LeadTimelineDrawer from './LeadTimelineDrawer'
import styles from './LeadKanbanView.module.css'

const COLUMNS: { id: Lead['status']; label: string; color: string }[] = [
  { id: 'novo',        label: 'Novo',        color: '#5CA0D9' },
  { id: 'em_contato',  label: 'Em Contato',  color: '#d97706' },
  { id: 'convertido',  label: 'Convertido',  color: '#059669' },
  { id: 'perdido',     label: 'Perdido',     color: '#dc2626' },
]

type CardHandlers = {
  onClick?: () => void
  onHistory?: () => void
  onFillConversion?: () => void
  onFillLoss?: () => void
}

function LeadCard({ lead, onClick, onHistory, onFillConversion, onFillLoss }: { lead: Lead } & CardHandlers) {
  // stopPropagation nos botões evita abrir o modal do card / iniciar o arrasto.
  const stop = (fn?: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn?.() }
  const stopDown = (e: React.PointerEvent) => e.stopPropagation()

  const isConv = lead.status === 'convertido'
  const isLost = lead.status === 'perdido'

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

      {/* Valor de conversão / motivo de perda (ou alerta de pendência) */}
      {isConv && (
        lead.conversion_value != null ? (
          <div className={styles.valueBadge}>
            <CircleDollarSign size={13} /> {formatBRL(lead.conversion_value)}
          </div>
        ) : onFillConversion && (
          <button className={styles.alertBadge} onClick={stop(onFillConversion)} onPointerDown={stopDown}>
            <TriangleAlert size={13} /> Valor de fechamento pendente
          </button>
        )
      )}
      {isLost && (
        lead.loss_reason ? (
          <div className={styles.reasonBadge}>{lead.loss_reason}</div>
        ) : onFillLoss && (
          <button className={styles.alertBadge} onClick={stop(onFillLoss)} onPointerDown={stopDown}>
            <TriangleAlert size={13} /> Motivo da perda pendente
          </button>
        )
      )}

      <div className={styles.cardFooter}>
        <span className={styles.cardDate}>
          {new Date(lead.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
        {onHistory && (
          <button className={styles.historyBtn} onClick={stop(onHistory)} onPointerDown={stopDown} title="Histórico do card" aria-label="Histórico do card">
            <History size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ lead, handlers }: { lead: Lead; handlers: CardHandlers }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${styles.draggable} ${isDragging ? styles.dragging : ''}`}
    >
      <LeadCard lead={lead} {...handlers} />
    </div>
  )
}

function KanbanColumn({
  id, label, color, leads, total, cardHandlers,
}: {
  id: string
  label: string
  color: string
  leads: Lead[]
  total?: number
  cardHandlers: (l: Lead) => CardHandlers
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div ref={setNodeRef} className={`${styles.column} ${isOver ? styles.columnOver : ''}`}>
      <div className={styles.columnHeader}>
        <div className={styles.dot} style={{ background: color }} />
        <span className={styles.columnLabel}>{label}</span>
        <span className={styles.columnCount}>{leads.length}</span>
      </div>
      {total != null && (
        <div className={styles.columnTotal}>{formatBRL(total)}</div>
      )}
      <div className={styles.cards}>
        {leads.map(lead => (
          <DraggableCard key={lead.id} lead={lead} handlers={cardHandlers(lead)} />
        ))}
      </div>
    </div>
  )
}

type Props = {
  leads: Lead[]
  allLeads?: Lead[]
  onStatusChange: (id: string, status: Lead['status']) => void
  onConvert: (id: string, value: number, fromStage: Lead['status']) => void
  onLose: (id: string, reason: string, note: string | null, fromStage: Lead['status']) => void
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

export default function LeadKanbanView({ leads, allLeads, onStatusChange, onConvert, onLose, fill }: Props) {
  const [activeId, setActiveId]       = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  // Lookup por id p/ abrir cards anteriores da mesma pessoa (mesmo se filtrados fora).
  const openById = (id: string) => { const l = (allLeads ?? leads).find(x => x.id === id); if (l) setSelectedLead(l) }
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Modais de stage (mover para Convertido/Perdido ou preencher card legado)
  const [convPrompt, setConvPrompt] = useState<{ lead: Lead; fromStage: Lead['status'] } | null>(null)
  const [lossPrompt, setLossPrompt] = useState<{ lead: Lead; fromStage: Lead['status'] } | null>(null)
  const [timelineLead, setTimelineLead] = useState<Lead | null>(null)

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
    const target = over.id as Lead['status']
    // Convertido/Perdido exigem preenchimento antes de entrar no stage.
    if (target === 'convertido') setConvPrompt({ lead, fromStage: lead.status })
    else if (target === 'perdido') setLossPrompt({ lead, fromStage: lead.status })
    else onStatusChange(lead.id, target)
  }

  const cardHandlers = (lead: Lead): CardHandlers => ({
    onClick: () => { setSelectedLead(lead); logActivity(`abriu o lead "${lead.name || 'sem nome'}"`) },
    onHistory: () => setTimelineLead(lead),
    onFillConversion: () => setConvPrompt({ lead, fromStage: lead.status }),
    onFillLoss: () => setLossPrompt({ lead, fromStage: lead.status }),
  })

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
          {COLUMNS.map(col => {
            const colLeads = sortLeads(leads.filter(l => l.status === col.id))
            const total = col.id === 'convertido'
              ? colLeads.reduce((acc, l) => acc + (l.conversion_value ?? 0), 0)
              : undefined
            return (
              <KanbanColumn
                key={col.id}
                id={col.id}
                label={col.label}
                color={col.color}
                leads={colLeads}
                total={total}
                cardHandlers={cardHandlers}
              />
            )
          })}
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

      {convPrompt && (
        <ConversionValueModal
          leadName={convPrompt.lead.name || 'lead'}
          initialValue={convPrompt.lead.conversion_value}
          onCancel={() => setConvPrompt(null)}
          onConfirm={(value) => {
            onConvert(convPrompt.lead.id, value, convPrompt.fromStage)
            setConvPrompt(null)
          }}
        />
      )}

      {lossPrompt && (
        <LossReasonModal
          leadName={lossPrompt.lead.name || 'lead'}
          initialReason={lossPrompt.lead.loss_reason}
          initialNote={lossPrompt.lead.loss_reason_note}
          onCancel={() => setLossPrompt(null)}
          onConfirm={(reason, note) => {
            onLose(lossPrompt.lead.id, reason, note, lossPrompt.fromStage)
            setLossPrompt(null)
          }}
        />
      )}

      {timelineLead && (
        <LeadTimelineDrawer
          leadId={timelineLead.id}
          leadName={timelineLead.name || 'lead'}
          onClose={() => setTimelineLead(null)}
        />
      )}
    </div>
  )
}
