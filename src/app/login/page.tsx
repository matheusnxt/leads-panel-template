'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usernameToEmail } from '@/lib/auth'
import { APP_NAME } from '@/lib/brand'
import { logActivity } from '@/lib/activity'
import styles from './page.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })
    setLoading(false)
    if (error) {
      setError('Usuário ou senha incorretos.')
      return
    }
    await logActivity('entrou na plataforma')
    router.replace('/')
    router.refresh()
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.brand}>
          <div className={styles.logoIcon}><Zap size={20} strokeWidth={2.5} /></div>
          <span className={styles.brandName}>{APP_NAME}</span>
        </div>

        <h1 className={styles.title}>Acessar o painel</h1>
        <p className={styles.subtitle}>Entre com suas credenciais para continuar.</p>

        <label className={styles.field}>
          <span>Usuário</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="seu.usuario"
            required
          />
        </label>

        <label className={styles.field}>
          <span>Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </label>

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" className={styles.btn} disabled={loading}>
          {loading ? <><Loader2 size={16} className={styles.spin} /> Entrando…</> : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
