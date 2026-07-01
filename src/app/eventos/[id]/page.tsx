'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, MapPin, Calendar, Tag, UserPlus, LayoutList, Columns3, Loader2, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatPhoneBR } from '@/lib/phone'
import type { EventItem, EventRegistration } from '@/lib/eventTypes'
import EventRegistrationsView from '@/components/eventos/EventRegistrationsView'
import styles from './page.module.css'

const empty = { name: '', phone: '', email: '', specialty: '', notes: '' }

export default function EventoDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [event, setEvent] = useState<EventItem | null>(null)
  const [regs, setRegs] = useState<EventRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [view, setView] = useState<'list' | 'kanban'>('list')

  const loadRegs = useCallback(async () => {
    const { data } = await supabase.from('event_registrations').select('*').eq('event_id', id).order('created_at', { ascending: false })
    setRegs((data ?? []) as EventRegistration[])
  }, [id])

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('events').select('*').eq('id', id).single()
      setEvent(data as EventItem)
      await loadRegs()
      setLoading(false)
    })()
  }, [id, loadRegs])

  async function addVisitor(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() && !form.phone.trim() && !form.email.trim()) return
    setSaving(true)
    await supabase.from('event_registrations').insert({
      event_id: id,
      name: form.name.trim() || null,
      phone: formatPhoneBR(form.phone) || null,
      email: form.email.trim() || null,
      specialty: form.specialty.trim() || null,
      notes: form.notes.trim() || null,
    })
    setSaving(false)
    setForm(empty)
    setDone(true); setTimeout(() => setDone(false), 2000)
    loadRegs()
  }

  const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : null

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>
  if (!event) return <div className={styles.loading}>Evento não encontrado.</div>

  return (
    <div className={styles.page}>
      <Link href="/eventos" className={styles.back}><ArrowLeft size={16} /> Eventos</Link>

      <div className={styles.eventHead}>
        <h1 className={styles.title}>{event.name}</h1>
        <div className={styles.meta}>
          {event.type && <span><Tag size={13} /> {event.type}</span>}
          {fmtDate(event.date) && <span><Calendar size={13} /> {fmtDate(event.date)}</span>}
          {event.location && <span><MapPin size={13} /> {event.location}</span>}
        </div>
        {event.theme && <p className={styles.theme}>{event.theme}</p>}
      </div>

      <form className={styles.formCard} onSubmit={addVisitor}>
        <h2 className={styles.formTitle}><UserPlus size={16} /> Cadastrar visitante do stand</h2>
        <div className={styles.formGrid}>
          <label className={styles.field}><span>Nome</span>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" /></label>
          <label className={styles.field}><span>Telefone</span>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" /></label>
          <label className={styles.field}><span>E-mail</span>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" /></label>
          <label className={styles.field}><span>Especialidade médica</span>
            <input value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} placeholder="Gastroenterologia" /></label>
        </div>
        <label className={styles.field}><span>Observações</span>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anotações sobre o contato…" rows={2} /></label>
        <div className={styles.formActions}>
          {done && <span className={styles.savedMsg}><Check size={15} /> Visitante cadastrado!</span>}
          <button type="submit" className={styles.btnPrimary} disabled={saving}>
            {saving ? <><Loader2 size={15} className={styles.spin} /> Salvando…</> : 'Cadastrar'}
          </button>
        </div>
      </form>

      <div className={styles.regsHead}>
        <h2 className={styles.regsTitle}>Inscritos ({regs.length})</h2>
        <div className={styles.viewToggle}>
          <button className={`${styles.viewBtn} ${view === 'list' ? styles.viewActive : ''}`} onClick={() => setView('list')}><LayoutList size={16} /></button>
          <button className={`${styles.viewBtn} ${view === 'kanban' ? styles.viewActive : ''}`} onClick={() => setView('kanban')}><Columns3 size={16} /></button>
        </div>
      </div>

      <EventRegistrationsView regs={regs} view={view} onChanged={loadRegs} />
    </div>
  )
}
