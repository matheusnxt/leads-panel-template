'use client'

import { useEffect, useRef, useState } from 'react'
import { UserCheck, ChevronDown, Plus, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'
import { logLeadActivity } from '@/lib/leadActivity'
import styles from './ResponsibleSelect.module.css'

// Atribui o responsável pelo atendimento de um lead.
// Qualquer usuário pode cadastrar novos responsáveis e alterar a atribuição.
export default function ResponsibleSelect({ leadId, leadName, value, onChange }: {
  leadId: string
  leadName: string
  value: string | null
  onChange?: (v: string | null) => void
}) {
  const [current, setCurrent] = useState<string | null>(value)
  const [options, setOptions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => setCurrent(value), [value])

  useEffect(() => {
    supabase.from('responsibles').select('name').order('name').then(({ data }) => {
      setOptions((data ?? []).map(r => r.name))
    })
  }, [])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function assign(name: string | null) {
    setCurrent(name)
    setOpen(false)
    onChange?.(name)
    await supabase.from('leads').update({ responsible: name }).eq('id', leadId)
    logActivity(name
      ? `atribuiu "${leadName}" para ${name}`
      : `removeu o responsável de "${leadName}"`)
    logLeadActivity(leadId, 'responsible', { metadata: { responsible: name } })
  }

  async function addNew() {
    const name = adding.trim()
    if (!name) return
    if (!options.includes(name)) {
      await supabase.from('responsibles').insert({ name })
      setOptions(prev => [...prev, name].sort())
    }
    setAdding('')
    assign(name)
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen(o => !o)}>
        <UserCheck size={14} />
        <span className={current ? styles.val : styles.placeholder}>{current || 'Atribuir responsável'}</span>
        <ChevronDown size={14} className={open ? styles.chevOpen : ''} />
      </button>

      {open && (
        <div className={styles.menu}>
          {current && (
            <button className={styles.clear} onClick={() => assign(null)}>
              <X size={13} /> Remover responsável
            </button>
          )}
          <div className={styles.list}>
            {options.map(o => (
              <button key={o} className={styles.item} onClick={() => assign(o)}>
                <span className={styles.itemLabel}>{o}</span>
                {o === current && <Check size={14} className={styles.checkIcon} />}
              </button>
            ))}
            {options.length === 0 && <div className={styles.emptyOpt}>Nenhum responsável cadastrado</div>}
          </div>
          <div className={styles.addRow}>
            <input
              value={adding}
              onChange={e => setAdding(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addNew() }}
              placeholder="Novo responsável…"
            />
            <button onClick={addNew} disabled={!adding.trim()}><Plus size={15} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
