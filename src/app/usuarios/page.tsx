'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserPlus, Trash2, Loader2, ShieldCheck, User, Pencil, X, Check, Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { TABS, type TabKey } from '@/lib/tabs'
import styles from './page.module.css'

type AppUser = {
  id: string
  username: string
  name: string | null
  role: 'adm' | 'usuario'
  permissions: string[] | null
  created_at: string
}

const emptyForm = { name: '', username: '', password: '', role: 'usuario' as 'adm' | 'usuario', permissions: ['leads', 'site', 'planilhas', 'eventos'] as string[] }

export default function UsuariosPage() {
  const { profile, loading: sessLoading } = useSession()
  const router = useRouter()

  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<AppUser | null>(null)

  useEffect(() => {
    if (!sessLoading && profile && profile.role !== 'adm') router.replace('/')
  }, [sessLoading, profile, router])

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
  }, [])

  const load = useCallback(async () => {
    const headers = await authHeader()
    const res = await fetch('/api/users', { headers })
    if (res.ok) setUsers((await res.json()).users ?? [])
    setLoading(false)
  }, [authHeader])

  useEffect(() => { load() }, [load])

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const headers = { ...(await authHeader()), 'Content-Type': 'application/json' }
    const res = await fetch('/api/users', { method: 'POST', headers, body: JSON.stringify(form) })
    setSaving(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Erro ao criar usuário.'); return }
    setForm(emptyForm)
    load()
  }

  async function removeUser(id: string, username: string) {
    if (!confirm(`Excluir o usuário "${username}"?`)) return
    const headers = await authHeader()
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE', headers })
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? 'Erro ao excluir.'); return }
    load()
  }

  function togglePerm(set: (fn: (p: string[]) => string[]) => void, key: TabKey) {
    set(perms => perms.includes(key) ? perms.filter(p => p !== key) : [...perms, key])
  }

  if (sessLoading || (profile && profile.role !== 'adm')) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>
  }

  return (
    <div className={styles.page}>
      <Link href="/atividades" className={styles.logLink}>
        <Activity size={16} /> Ver log de atividades
      </Link>

      <form className={styles.card} onSubmit={createUser}>
        <h2 className={styles.cardTitle}><UserPlus size={17} /> Novo usuário</h2>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Nome</span>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Maria Silva" />
          </label>
          <label className={styles.field}>
            <span>Usuário</span>
            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="maria" required />
          </label>
          <label className={styles.field}>
            <span>Senha</span>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="mín. 6 caracteres" required />
          </label>
          <label className={styles.field}>
            <span>Permissão</span>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'adm' | 'usuario' }))}>
              <option value="usuario">Usuário</option>
              <option value="adm">Administrador</option>
            </select>
          </label>
        </div>

        {form.role === 'usuario' && (
          <div className={styles.permsBlock}>
            <span className={styles.permsLabel}>Abas que pode acessar</span>
            <div className={styles.permsList}>
              {TABS.map(t => {
                const on = form.permissions.includes(t.key)
                return (
                  <button type="button" key={t.key} className={`${styles.permChip} ${on ? styles.permOn : ''}`}
                    onClick={() => togglePerm(fn => setForm(f => ({ ...f, permissions: fn(f.permissions) })), t.key)}>
                    <span className={`${styles.permCheck} ${on ? styles.permCheckOn : ''}`}>{on && <Check size={11} strokeWidth={3} />}</span>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.formActions}>
          <button type="submit" className={styles.btnPrimary} disabled={saving}>
            {saving ? <><Loader2 size={15} className={styles.spin} /> Criando…</> : 'Criar usuário'}
          </button>
        </div>
      </form>

      <div className={styles.listCard}>
        <h2 className={styles.cardTitle}>Usuários cadastrados</h2>
        {loading ? (
          <div className={styles.loadingInline}><div className={styles.spinner} /></div>
        ) : (
          <div className={styles.list}>
            {users.map(u => (
              <div key={u.id} className={styles.userRow}>
                <div className={styles.avatar}>{(u.name || u.username).charAt(0).toUpperCase()}</div>
                <div className={styles.userMain}>
                  <div className={styles.userName}>{u.name || u.username}</div>
                  <div className={styles.userMeta}>
                    @{u.username}
                    {u.role === 'usuario' && (
                      <span className={styles.tabsHint}> · {(u.permissions ?? []).map(p => TABS.find(t => t.key === p)?.label).filter(Boolean).join(', ') || 'sem abas'}</span>
                    )}
                  </div>
                </div>
                <span className={`${styles.roleBadge} ${u.role === 'adm' ? styles.adm : styles.usr}`}>
                  {u.role === 'adm' ? <><ShieldCheck size={12} /> Administrador</> : <><User size={12} /> Usuário</>}
                </span>
                <button className={styles.editBtn} onClick={() => setEditing(u)} title="Editar"><Pencil size={15} /></button>
                <button className={styles.deleteBtn} onClick={() => removeUser(u.id, u.username)} title="Excluir"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
          authHeader={authHeader}
        />
      )}
    </div>
  )
}

function EditModal({ user, onClose, onSaved, authHeader }: {
  user: AppUser
  onClose: () => void
  onSaved: () => void
  authHeader: () => Promise<{ Authorization: string }>
}) {
  const [name, setName] = useState(user.name ?? '')
  const [role, setRole] = useState<'adm' | 'usuario'>(user.role)
  const [permissions, setPermissions] = useState<string[]>(user.permissions ?? ['leads', 'site', 'planilhas', 'eventos'])
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const headers = { ...(await authHeader()), 'Content-Type': 'application/json' }
    const body: Record<string, unknown> = { name, role, permissions }
    if (password) body.password = password
    const res = await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
    setSaving(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Erro ao salvar.'); return }
    onSaved()
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Editar <strong>@{user.username}</strong></h3>
          <button className={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <label className={styles.field}>
          <span>Nome</span>
          <input value={name} onChange={e => setName(e.target.value)} />
        </label>

        <label className={styles.field}>
          <span>Permissão</span>
          <select value={role} onChange={e => setRole(e.target.value as 'adm' | 'usuario')}>
            <option value="usuario">Usuário</option>
            <option value="adm">Administrador</option>
          </select>
        </label>

        {role === 'usuario' && (
          <div className={styles.permsBlock}>
            <span className={styles.permsLabel}>Abas que pode acessar</span>
            <div className={styles.permsList}>
              {TABS.map(t => {
                const on = permissions.includes(t.key)
                return (
                  <button type="button" key={t.key} className={`${styles.permChip} ${on ? styles.permOn : ''}`}
                    onClick={() => setPermissions(p => p.includes(t.key) ? p.filter(x => x !== t.key) : [...p, t.key])}>
                    <span className={`${styles.permCheck} ${on ? styles.permCheckOn : ''}`}>{on && <Check size={11} strokeWidth={3} />}</span>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <label className={styles.field}>
          <span>Nova senha (opcional)</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="deixe em branco para manter" />
        </label>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.formActions}>
          <button className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          <button className={styles.btnPrimary} onClick={save} disabled={saving}>
            {saving ? <><Loader2 size={15} className={styles.spin} /> Salvando…</> : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
