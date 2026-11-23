import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseFieldData, fetchFormName, toLeadRow, isTestLead, utmFrom, resolvePageToken, UTM_FIELDS } from '@/lib/meta'

export const maxDuration = 60

const GRAPH = 'https://graph.facebook.com/v21.0'
const PAGE_ID = process.env.META_PAGE_ID ?? ''

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// Importa leads já existentes nos formulários da página do Meta (META_PAGE_ID).
// Protegido pelo mesmo token do webhook. Idempotente via meta_lead_id.
//
// Uso: POST /api/backfill?token=...&form_id=...&max=200
//   - form_id (opcional): importa só de um formulário. Sem ele, importa de todos os ativos.
//   - max (opcional): teto de leads por formulário (default 500).
//   - skip/take (opcionais): processa só um lote de formulários (default: todos). Útil quando a
//     hospedagem limita as consultas externas por chamada; a resposta traz totalForms.
export async function POST(request: NextRequest) {
  try {
    return await executar(request)
  } catch (e) {
    console.error('[backfill] falhou', e)
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

async function executar(request: NextRequest) {
  const p = request.nextUrl.searchParams
  if (p.get('token') !== process.env.WEBHOOK_VERIFY_TOKEN) {
    return new Response('Forbidden', { status: 403 })
  }

  const token = await resolvePageToken(process.env.META_PAGE_ACCESS_TOKEN!, PAGE_ID)
  const onlyForm = p.get('form_id')
  const max = Number(p.get('max') ?? '500')
  const skip = Math.max(0, Number(p.get('skip') ?? '0'))
  const take = Math.max(1, Number(p.get('take') ?? '1000'))
  const supabase = getSupabase()

  // Lista os formulários a processar (pagina TODOS — novos formulários entram sozinhos)
  let formIds: string[] = []
  let metaError: string | null = null
  if (onlyForm) {
    formIds = [onlyForm]
  } else {
    let url: string | null =
      `${GRAPH}/${PAGE_ID}/leadgen_forms?fields=id,status&limit=100&access_token=${token}`
    while (url) {
      const res: Response = await fetch(url)
      if (!res.ok) {
        // Mostra o motivo do Meta (sem o token) em vez de falhar calado.
        metaError = (await res.json().catch(() => null))?.error?.message ?? `HTTP ${res.status}`
        break
      }
      const data = await res.json()
      formIds.push(...(data.data ?? []).map((f: { id: string }) => f.id))
      url = data.paging?.next ?? null
    }
  }

  const totalForms = formIds.length
  formIds = formIds.slice(skip, skip + take)

  let imported = 0
  let skipped = 0
  const perForm: Record<string, number> = {}

  for (const formId of formIds) {
    const form_name = await fetchFormName(formId, token)
    let count = 0
    let url: string | null =
      `${GRAPH}/${formId}/leads?fields=${UTM_FIELDS}&limit=100&access_token=${token}`

    while (url && count < max) {
      const res: Response = await fetch(url)
      if (!res.ok) break
      const page = await res.json()

      const rows = []
      for (const lead of page.data ?? []) {
        if (isTestLead(lead.field_data)) { count++; continue }
        const parsed = parseFieldData(lead.field_data)
        rows.push({
          ...toLeadRow(parsed, form_name, lead.created_time, utmFrom(lead)),
          meta_lead_id: lead.id,
        })
        count++
        if (count >= max) break
      }

      if (rows.length > 0) {
        // onConflict em meta_lead_id evita duplicar em re-execuções
        const { error, count: inserted } = await supabase
          .from('leads')
          .upsert(rows, { onConflict: 'meta_lead_id', ignoreDuplicates: true, count: 'exact' })
        if (error) {
          return Response.json({ error: error.message, hint: 'A coluna meta_lead_id existe?' }, { status: 500 })
        }
        imported += inserted ?? 0
        skipped += rows.length - (inserted ?? 0)
      }

      url = count < max ? (page.paging?.next ?? null) : null
    }

    perForm[form_name] = count
  }

  return Response.json({ status: metaError ? 'erro_meta' : 'ok', imported, skipped, totalForms, perForm, ...(metaError ? { metaError } : {}) })
}
