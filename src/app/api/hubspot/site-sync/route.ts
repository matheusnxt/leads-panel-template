import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { formatPhoneBR } from '@/lib/phone'

export const maxDuration = 60

// Sincroniza os leads do FORMULÁRIO DO SITE (HubSpot) para a aba Leads Site.
// A API do HubSpot não permite filtrar contatos por formulário na busca, e o
// token não tem o escopo `forms`; então varremos os contatos mais recentes,
// lemos `hs_calculated_form_submissions` (formato `guid::timestamp;...`) e
// filtramos pelo GUID do form do site. Idempotente via meta_lead_id.
//
// Uso: POST /api/hubspot/site-sync?token=<WEBHOOK_VERIFY_TOKEN>&max=1000
// Protegido pelo mesmo token do webhook (para o pg_cron chamar).

const HS = 'https://api.hubapi.com'
const SITE_FORM_ID = process.env.SITE_FORM_ID ?? '89e09eed-f8f0-42e4-9db5-a9bdc6e9d5c1'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

type HsContact = { properties: Record<string, string | null> }

async function searchPage(token: string, after?: string): Promise<{ results: HsContact[]; after?: string }> {
  const res = await fetch(`${HS}/crm/v3/objects/contacts/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'hs_calculated_form_submissions', operator: 'HAS_PROPERTY' }] }],
      properties: [
        'email', 'firstname', 'lastname', 'phone', 'hs_calculated_form_submissions',
        // Respostas de qualificação (perguntas do formulário) → lead score.
        'especialidade_medica', 'especialidade', 'especialidade_02',
        'disponibilidade_de_investimento', 'investimento',
        'perfil_decisor', 'deciso', 'urgncia',
        'paciente__sintomas', 'pacientes_ja_realizou_exames_de_investigacao_sintomatica',
      ],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
      limit: 100,
      ...(after ? { after } : {}),
    }),
    cache: 'no-store',
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.message ?? `HubSpot ${res.status}`)
  return { results: json.results ?? [], after: json.paging?.next?.after }
}

// Monta custom_questions com as respostas de qualificação (chaves limpas que o
// scoreLead reconhece: Especialidade / Investimento / Decisão / Urgência / paciente).
function buildQuestions(p: Record<string, string | null>): Record<string, string> | null {
  const q: Record<string, string> = {}
  const put = (label: string, ...vals: (string | null | undefined)[]) => {
    const v = vals.find(x => x && String(x).trim())
    if (v) q[label] = String(v).trim()
  }
  put('Especialidade', p.especialidade_medica, p.especialidade, p.especialidade_02)
  put('Investimento', p.disponibilidade_de_investimento, p.investimento)
  put('Decisão', p.perfil_decisor, p.deciso)
  put('Urgência', p.urgncia)
  put('Sintomas (paciente)', p.paciente__sintomas)
  put('Investigação (paciente)', p.pacientes_ja_realizou_exames_de_investigacao_sintomatica)
  return Object.keys(q).length ? q : null
}

// Extrai os timestamps (ms) das submissões de um form específico.
function submissionsFor(fs: string | null, formId: string): number[] {
  if (!fs) return []
  const out: number[] = []
  for (const part of fs.split(';')) {
    const [guid, ts] = part.split('::')
    if (guid?.trim() === formId && ts) {
      const n = Number(ts)
      if (Number.isFinite(n)) out.push(n)
    }
  }
  return out
}

export async function POST(request: NextRequest) {
  return run(request)
}
export async function GET(request: NextRequest) {
  return run(request)
}

async function run(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== process.env.WEBHOOK_VERIFY_TOKEN) {
    return new Response('Forbidden', { status: 403 })
  }
  const token = process.env.HUBSPOT_TOKEN
  if (!token) return Response.json({ error: 'HUBSPOT_TOKEN não configurado' }, { status: 500 })

  const max = Math.min(Number(request.nextUrl.searchParams.get('max') ?? 1000), 5000)

  const supabase = getSupabase()
  let scanned = 0
  let matched = 0
  const rows: Record<string, unknown>[] = []
  let after: string | undefined

  try {
    while (scanned < max) {
      const page = await searchPage(token, after)
      if (page.results.length === 0) break
      scanned += page.results.length

      for (const c of page.results) {
        const p = c.properties
        const cq = buildQuestions(p)
        for (const ts of submissionsFor(p.hs_calculated_form_submissions, SITE_FORM_ID)) {
          matched++
          const name = [p.firstname, p.lastname].filter(Boolean).join(' ').trim()
          rows.push({
            name: name || null,
            email: p.email ?? null,
            phone: p.phone ? formatPhoneBR(p.phone) : null,
            status: 'novo',
            form_name: 'Formulário Site',
            custom_questions: cq,
            created_at: new Date(ts).toISOString(),
            source: 'site',
            // Dedup: 1 lead por contato+form (reconversões não duplicam).
            meta_lead_id: `hsform:${SITE_FORM_ID}:${ts}`,
          })
        }
      }
      if (!page.after) break
      after = page.after
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message, scanned, matched }, { status: 502 })
  }

  let imported = 0
  let enriched = 0
  if (rows.length > 0) {
    // Insere apenas os novos (ignoreDuplicates preserva status/responsável de quem já existe).
    const { data, error } = await supabase
      .from('leads')
      .upsert(rows, { onConflict: 'meta_lead_id', ignoreDuplicates: true })
      .select('id')
    if (error) return Response.json({ error: error.message, scanned, matched }, { status: 500 })
    imported = data?.length ?? 0

    // Preenche custom_questions em leads já existentes cujo valor está null
    // (backfill do lead score, sem sobrescrever status nem respostas existentes).
    for (const r of rows) {
      if (!r.custom_questions) continue
      const { data: upd } = await supabase
        .from('leads')
        .update({ custom_questions: r.custom_questions })
        .eq('meta_lead_id', r.meta_lead_id)
        .is('custom_questions', null)
        .select('id')
      enriched += upd?.length ?? 0
    }
  }

  return Response.json({ ok: true, scanned, matched, imported, enriched, formId: SITE_FORM_ID })
}
