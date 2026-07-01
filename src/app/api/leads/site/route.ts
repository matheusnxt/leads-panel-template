import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { formatPhoneBR } from '@/lib/phone'

// Recebe leads vindos do site e os grava com source = 'site'.
// Segurança: se SITE_LEADS_TOKEN estiver definido, exige o token
// (header x-api-token, Authorization: Bearer <token> ou ?token=).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-token, Authorization',
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.SITE_LEADS_TOKEN
  if (!expected) return true // sem token configurado, não bloqueia
  const header =
    request.headers.get('x-api-token') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.nextUrl.searchParams.get('token')
  return header === expected
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400, headers: CORS })
  }

  const str = (v: unknown) => (v == null ? null : String(v).trim() || null)

  const name = str(body.name ?? body.nome)
  const email = str(body.email ?? body['e-mail'])
  const phoneRaw = str(body.phone ?? body.telefone ?? body.celular ?? body.whatsapp)

  if (!name && !email && !phoneRaw) {
    return Response.json({ error: 'Informe ao menos nome, e-mail ou telefone.' }, { status: 400, headers: CORS })
  }

  // Campos extras viram custom_questions; um objeto explícito também é aceito.
  const reserved = new Set([
    'name', 'nome', 'email', 'e-mail', 'phone', 'telefone', 'celular', 'whatsapp',
    'form_name', 'origem', 'utm', 'platform', 'campaign', 'adset', 'ad_name', 'created_at',
  ])
  const custom: Record<string, string> = {}
  if (body.custom_questions && typeof body.custom_questions === 'object') {
    for (const [k, v] of Object.entries(body.custom_questions as Record<string, unknown>)) {
      const val = str(v)
      if (val) custom[k] = val
    }
  }
  for (const [k, v] of Object.entries(body)) {
    if (reserved.has(k) || k === 'custom_questions') continue
    const val = str(v)
    if (val) custom[k] = val
  }

  const utm = (body.utm && typeof body.utm === 'object' ? body.utm : {}) as Record<string, unknown>

  const row = {
    name,
    email,
    phone: phoneRaw ? formatPhoneBR(phoneRaw) : null,
    status: 'novo' as const,
    form_name: str(body.form_name ?? body.origem) ?? 'Site',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    custom_questions: custom,
    created_at: str(body.created_at) ?? new Date().toISOString(),
    platform: str(body.platform ?? utm.platform),
    campaign: str(body.campaign ?? utm.campaign),
    adset: str(body.adset ?? utm.adset),
    ad_name: str(body.ad_name ?? utm.ad_name),
    responsible: null,
    source: 'site' as const,
  }

  const supabase = getSupabase()
  const { error } = await supabase.from('leads').insert(row)
  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS })
  }

  return Response.json({ ok: true }, { headers: CORS })
}
