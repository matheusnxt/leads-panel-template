'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarHeart, MapPin, Plus, X, Loader2, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import type { EventItem } from '@/lib/eventTypes'
import styles from './page.module.css'

export default function EventosPage() {
  const { profile } = useSession()
  const isAdmin = profile?.role === 'adm'
  const [events, setEvents] = useState<EventItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('events').select('*').order('date', { ascending: false, nullsFirst: false })
    const list = (data ?? []) as EventItem[]
    setEvents(list)
    // contagem de inscritos por evento
    const { data: regs } = await supabase.from('event_registrations').select('event_id')
    const c: Record<string, number> = {}
    for (const r of regs ?? []) c[r.event_id] = (c[r.event_id] ?? 0) + 1
    setCounts(c)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem data'

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Eventos</h1>
          <p className={styles.subtitle}>{events.length} {events.length === 1 ? 'evento' : 'eventos'} · base de visitantes de stand</p>
        </div>
        {isAdmin && (
          <button className={styles.newBtn} onClick={() => setShowForm(true)}>
            <Plus size={16} /> Novo evento
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div className={styles.empty}>
          <CalendarHeart size={28} />
          <p>Nenhum evento cadastrado ainda.{isAdmin ? ' Crie o primeiro acima.' : ''}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {events.map(ev => (
            <Link key={ev.id} href={`/eventos/${ev.id}`} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.cardType}>{ev.type || 'Evento'}</span>
                <span className={styles.cardCount}>{counts[ev.id] ?? 0} inscritos</span>
              </div>
              <h2 className={styles.cardName}>{ev.name}</h2>
              {ev.theme && <p className={styles.cardTheme}>{ev.theme}</p>}
              <div className={styles.cardMeta}>
                <span>{fmtDate(ev.date)}</span>
                {ev.location && <span><MapPin size={12} /> {ev.location}</span>}
              </div>
              <ChevronRight size={18} className={styles.cardArrow} />
            </Link>
          ))}
        </div>
      )}

      {showForm && <EventForm onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function EventForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', date: '', location: '', type: '', theme: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('O nome do evento é obrigatório.'); return }
    setSaving(true); setError(null)
    const { error } = await supabase.from('events').insert({
      name: form.name.trim(),
      date: form.date || null,
      location: form.location.trim() || null,
      type: form.type.trim() || null,
      theme: form.theme.trim() || null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    onCreated()
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <form className={styles.modal} onClick={e => e.stopPropagation()} onSubmit={save}>
        <div className={styles.modalHead}>
          <h3>Novo evento</h3>
          <button type="button" className={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <label className={styles.field}><span>Nome do evento *</span>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Congresso de Gastroenterologia 2026" required /></label>
        <div className={styles.row2}>
          <label className={styles.field}><span>Data</span>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></label>
          <label className={styles.field}><span>Tipo de evento</span>
            <input value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} placeholder="Congresso, Feira…" /></label>
        </div>
        <label className={styles.field}><span>Local</span>
          <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="São Paulo - SP, Expo Center Norte" /></label>
        <label className={styles.field}><span>Tema</span>
          <input value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} placeholder="Saúde digestiva e diagnóstico" /></label>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.btnPrimary} disabled={saving}>
            {saving ? <><Loader2 size={15} className={styles.spin} /> Salvando…</> : 'Criar evento'}
          </button>
        </div>
      </form>
    </div>
  )
}
