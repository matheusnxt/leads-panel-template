'use client'

import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
} from '@dnd-kit/core'
import { supabase } from '@/lib/supabase'
import type { EventRegistration } from '@/lib/eventTypes'
import styles from './EventRegistrationsView.module.css'

const STATUS: { id: EventRegistration['status']; label: string; color: string }[] = [
  { id: 'novo', label: 'Novo', color: '#5CA0D9' },
  { id: 'em_contato', label: 'Em Contato', color: '#d97706' },
  { id: 'convertido', label: 'Convertido', color: '#059669' },
  { id: 'perdido', label: 'Perdido', color: '#dc2626' },
]
const LABEL: Record<string, string> = Object.fromEntries(STATUS.map(s => [s.id, s.label]))

async function setStatus(id: string, status: EventRegistration['status']) {
  await supabase.from('event_registrations').update({ status }).eq('id', id)
}

export default function EventRegistrationsView({ regs, view, onChanged }: {
  regs: EventRegistration[]
  view: 'list' | 'kanban'
  onChanged: () => void
}) {
  if (regs.length === 0) {
    return <div className={styles.empty}>Nenhum visitante cadastrado ainda.</div>
  }

  return view === 'list'
    ? <RegTable regs={regs} onChanged={onChanged} />
    : <RegKanban regs={regs} onChanged={onChanged} />
}

function RegTable({ regs, onChanged }: { regs: EventRegistration[]; onChanged: () => void }) {
  const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead><tr>
          <th>Nome</th><th>Telefone</th><th>E-mail</th><th>Especialidade</th><th>Observações</th><th>Status</th><th>Data</th>
        </tr></thead>
        <tbody>
          {regs.map(r => (
            <tr key={r.id}>
              <td className={styles.strong}>{r.name || '—'}</td>
              <td>{r.phone || '—'}</td>
              <td>{r.email || '—'}</td>
              <td>{r.specialty || '—'}</td>
              <td className={styles.notes}>{r.notes || '—'}</td>
              <td>
                <select
                  className={styles.statusSel}
                  value={r.status}
                  onChange={async e => { await setStatus(r.id, e.target.value as EventRegistration['status']); onChanged() }}
                >
                  {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </td>
              <td>{fmt(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Card({ reg }: { reg: EventRegistration }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardName}>{reg.name || 'Sem nome'}</div>
      {reg.phone && <div className={styles.cardMeta}>{reg.phone}</div>}
      {reg.email && <div className={styles.cardMeta}>{reg.email}</div>}
      {reg.specialty && <div className={styles.cardTag}>{reg.specialty}</div>}
      {reg.notes && <div className={styles.cardNotes}>{reg.notes}</div>}
    </div>
  )
}

function DraggableCard({ reg }: { reg: EventRegistration }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: reg.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? styles.dragging : ''}>
      <Card reg={reg} />
    </div>
  )
}

function Column({ id, label, color, regs }: { id: string; label: string; color: string; regs: EventRegistration[] }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`${styles.column} ${isOver ? styles.over : ''}`}>
      <div className={styles.colHead}>
        <span className={styles.dot} style={{ background: color }} />
        <span className={styles.colLabel}>{label}</span>
        <span className={styles.colCount}>{regs.length}</span>
      </div>
      <div className={styles.cards}>
        {regs.map(r => <DraggableCard key={r.id} reg={r} />)}
      </div>
    </div>
  )
}

function RegKanban({ regs, onChanged }: { regs: EventRegistration[]; onChanged: () => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return
    const reg = regs.find(r => r.id === active.id)
    if (!reg || reg.status === over.id) return
    await setStatus(reg.id, over.id as EventRegistration['status'])
    onChanged()
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className={styles.board}>
        {STATUS.map(s => (
          <Column key={s.id} id={s.id} label={s.label} color={s.color} regs={regs.filter(r => r.status === s.id)} />
        ))}
      </div>
    </DndContext>
  )
}
