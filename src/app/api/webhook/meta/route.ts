import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { parseFieldData, fetchLead, fetchFormName, toLeadRow, isTestLead, utmFrom } from '@/lib/meta'

// Confere a assinatura HMAC enviada pelo Meta (x-hub-signature-256)
function validSignature(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET
  if (!secret) return true // sem segredo configurado, não bloqueia
  if (!header) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// Meta chama este endpoint uma vez para verificar que a URL é sua
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams

  const mode      = p.get('hub.mode')
  const token     = p.get('hub.verify_token')
  const challenge = p.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

// Meta chama este endpoint toda vez que alguém preenche um formulário
export async function POST(request: NextRequest) {
  const raw = await request.text()
  if (!validSignature(raw, request.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 403 })
  }

  type WebhookBody = {
    object?: string
    entry?: { changes?: { field?: string; value?: { leadgen_id: string; form_id: string } }[] }[]
  }
  let body: WebhookBody
  try { body = JSON.parse(raw) } catch { return Response.json({ status: 'bad request' }, { status: 400 }) }

  if (body.object !== 'page') {
    return Response.json({ status: 'ignored' })
  }

  const supabase = getSupabase()
  const token = process.env.META_PAGE_ACCESS_TOKEN!
  const formNameCache = new Map<string, string>()

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen' || !change.value) continue

      const { leadgen_id, form_id } = change.value

      const leadData = await fetchLead(leadgen_id, token)
      if (!leadData) continue
      if (isTestLead(leadData.field_data)) continue

      const parsed = parseFieldData(leadData.field_data)

      let form_name = formNameCache.get(form_id)
      if (!form_name) {
        form_name = await fetchFormName(form_id, token)
        formNameCache.set(form_id, form_name)
      }

      const row = { ...toLeadRow(parsed, form_name, leadData.created_time, utmFrom(leadData)), meta_lead_id: leadgen_id }
      await supabase.from('leads').upsert(row, { onConflict: 'meta_lead_id', ignoreDuplicates: true })
    }
  }

  return Response.json({ status: 'ok' })
}
