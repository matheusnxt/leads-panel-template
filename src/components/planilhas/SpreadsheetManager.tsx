'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileSpreadsheet, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'
import styles from './SpreadsheetManager.module.css'

type Sheet = { name: string; count: number }
const PAGE = 1000

export default function SpreadsheetManager({ refreshKey, onChanged, isAdmin, source = 'planilha' }: {
  refreshKey: number
  onChanged: () => void
  isAdmin?: boolean
  source?: string
}) {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const counts = new Map<string, number>()
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('leads').select('form_name').eq('source', source)
        .range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      for (const r of data) {
        const n = r.form_name || 'Sem nome'
        counts.set(n, (counts.get(n) ?? 0) + 1)
      }
      if (data.length < PAGE) break
      from += PAGE
    }
    setSheets([...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    setLoading(false)
  }, [source])

  useEffect(() => { load() }, [load, refreshKey])

  async function rename(oldName: string) {
    const name = newName.trim()
    if (!name || name === oldName) { setEditing(null); return }
    setBusy(true)
    await supabase.from('leads').update({ form_name: name }).eq('source', source).eq('form_name', oldName)
    await logActivity(`renomeou a planilha "${oldName}" para "${name}"`)
    setBusy(false); setEditing(null)
    load(); onChanged()
  }

  async function remove(name: string, count: number) {
    if (!confirm(`Excluir a planilha "${name}" e seus ${count} leads? Essa ação não pode ser desfeita.`)) return
    setBusy(true)
    await supabase.from('leads').delete().eq('source', source).eq('form_name', name)
    await logActivity(`excluiu a planilha "${name}" (${count} leads)`)
    setBusy(false)
    load(); onChanged()
  }

  if (loading) return null
  if (sheets.length === 0) return null

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>Planilhas importadas ({sheets.length})</h3>
      <div className={styles.list}>
        {sheets.map(s => (
          <div key={s.name} className={styles.row}>
            <FileSpreadsheet size={16} className={styles.icon} />
            {editing === s.name ? (
              <>
                <input
                  className={styles.input}
                  value={newName}
                  autoFocus
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') rename(s.name); if (e.key === 'Escape') setEditing(null) }}
                />
                <button className={styles.iconBtn} disabled={busy} onClick={() => rename(s.name)} title="Salvar">
                  {busy ? <Loader2 size={15} className={styles.spin} /> : <Check size={15} />}
                </button>
                <button className={styles.iconBtn} onClick={() => setEditing(null)} title="Cancelar"><X size={15} /></button>
              </>
            ) : (
              <>
                <span className={styles.name}>{s.name}</span>
                <span className={styles.count}>{s.count} {s.count === 1 ? 'lead' : 'leads'}</span>
                <button className={styles.iconBtn} onClick={() => { setEditing(s.name); setNewName(s.name) }} title="Renomear">
                  <Pencil size={15} />
                </button>
                {isAdmin && (
                  <button className={`${styles.iconBtn} ${styles.del}`} onClick={() => remove(s.name, s.count)} title="Excluir">
                    <Trash2 size={15} />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
