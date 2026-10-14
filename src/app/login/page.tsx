'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usernameToEmail } from '@/lib/auth'
import { APP_NAME } from '@/lib/brand'
import { logActivity } from '@/lib/activity'
import styles from './page.module.css'

// Site key pública do Cloudflare Turnstile. Se não estiver definida, o desafio
// anti-robô fica inativo e o login funciona normalmente (rollout seguro).
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

// "usuário" vira e-mail sintético; se já contém "@", é um e-mail real (login OU e-mail).
function resolveEmail(input: string): string {
  const v = input.trim()
  return v.includes('@') ? v.toLowerCase() : usernameToEmail(v)
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
    }
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const widgetRef = useRef<HTMLDivElement>(null)

  // Carrega e renderiza o widget Turnstile (só se a site key estiver configurada).
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !widgetRef.current) return
    const render = () => {
      if (!window.turnstile || !widgetRef.current || widgetRef.current.childElementCount) return
      window.turnstile.render(widgetRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t: string) => setCaptcha(t),
        'expired-callback': () => setCaptcha(null),
        'error-callback': () => setCaptcha(null),
      })
    }
    if (window.turnstile) { render(); return }
    const id = 'cf-turnstile-script'
    if (!document.getElementById(id)) {
      const s = document.createElement('script')
      s.id = id
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true; s.defer = true
      s.onload = render
      document.head.appendChild(s)
    } else {
      const t = setInterval(() => { if (window.turnstile) { clearInterval(t); render() } }, 200)
      return () => clearInterval(t)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    // "fail-open" no front: mandamos o token quando existe, mas não bloqueamos o
    // login por ele — a validação obrigatória (à prova de bypass) fica no Supabase.
    const { error } = await supabase.auth.signInWithPassword({
      email: resolveEmail(identifier),
      password,
      ...(captcha ? { options: { captchaToken: captcha } } : {}),
    })
    setLoading(false)
    if (error) {
      const msg = /captcha/i.test(error.message)
        ? 'Verificação anti-robô falhou. Recarregue a página e tente novamente.'
        : 'Usuário ou senha incorretos.'
      setError(msg)
      window.turnstile?.reset()
      setCaptcha(null)
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
          <Image
            src="/logo-healthgo-petroleo.png"
            alt={APP_NAME}
            width={1200}
            height={235}
            priority
            className={styles.brandLogo}
          />
        </div>

        <h1 className={styles.title}>Acessar o painel</h1>
        <p className={styles.subtitle}>Entre com suas credenciais para continuar.</p>

        <label className={styles.field}>
          <span>Usuário ou e-mail</span>
          <input
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder="seu.usuario ou email@empresa.com"
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

        {TURNSTILE_SITE_KEY && <div ref={widgetRef} className={styles.captcha} />}

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" className={styles.btn} disabled={loading}>
          {loading ? <><Loader2 size={16} className={styles.spin} /> Entrando…</> : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
