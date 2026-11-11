import { createHash } from 'crypto'

// API de Conversões do Meta (eventos enviados pelo servidor).
// Fica desligada até META_CAPI_TOKEN existir no ambiente da Vercel: sem o token,
// enviarEventoMeta não faz nada e o cadastro segue normalmente.
//
// O mesmo evento também é disparado pelo Pixel no navegador com o mesmo
// event_id; o Meta junta os dois e conta uma vez só (deduplicação).

const PIXEL_PADRAO = '852411264350858' // "Anúncios HealthGo Pixel"
const VERSAO_API = 'v21.0'

const hash = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex')

export type EventoMeta = {
  nome: string
  eventId: string
  url: string | null
  email?: string
  telefone?: string // só dígitos, com DDI
  primeiroNome?: string
  sobrenome?: string
  ip?: string | null
  userAgent?: string | null
  fbp?: string | null
  fbc?: string | null
  dados?: Record<string, unknown>
}

export async function enviarEventoMeta(e: EventoMeta): Promise<void> {
  const token = process.env.META_CAPI_TOKEN
  if (!token) return
  const pixel = process.env.META_PIXEL_ID || PIXEL_PADRAO

  const user_data: Record<string, unknown> = { country: [hash('br')] }
  if (e.email) user_data.em = [hash(e.email)]
  if (e.telefone) user_data.ph = [hash(e.telefone.replace(/\D/g, ''))]
  if (e.primeiroNome) user_data.fn = [hash(e.primeiroNome)]
  if (e.sobrenome) user_data.ln = [hash(e.sobrenome)]
  if (e.ip) user_data.client_ip_address = e.ip
  if (e.userAgent) user_data.client_user_agent = e.userAgent
  if (e.fbp) user_data.fbp = e.fbp
  if (e.fbc) user_data.fbc = e.fbc

  const corpo: Record<string, unknown> = {
    data: [{
      event_name: e.nome,
      event_time: Math.floor(Date.now() / 1000),
      event_id: e.eventId,
      action_source: 'website',
      event_source_url: e.url ?? undefined,
      user_data,
      custom_data: e.dados ?? {},
    }],
  }
  if (process.env.META_CAPI_TEST_CODE) corpo.test_event_code = process.env.META_CAPI_TEST_CODE

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch(`https://graph.facebook.com/${VERSAO_API}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    })
    if (!res.ok) console.error('[meta-capi] falha', res.status, (await res.text()).slice(0, 300))
  } catch (err) {
    console.error('[meta-capi] erro de rede', String(err))
  } finally {
    clearTimeout(timer)
  }
}
