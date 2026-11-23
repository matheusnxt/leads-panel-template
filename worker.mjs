// Entrada do Worker: o painel (OpenNext) + uma tarefa agendada, a cada minuto, que
// traz os leads novos do Meta Ads e do formulário do site (HubSpot) para o painel.
import handler from './.open-next/worker.js'

// Classes que o OpenNext exporta (Durable Objects). O painel não as usa, mas o
// pacote espera que continuem exportadas.
export * from './.open-next/worker.js'

// Janela de busca: a sobreposição é proposital. /api/backfill e /api/hubspot/site-sync
// não duplicam (meta_lead_id é único), então repetir é seguro.
const JANELA_SEGUNDOS = 3 * 60 * 60
// O plano grátis limita 50 consultas externas por execução; por isso os lotes.
const FORMULARIOS_POR_LOTE = 8
const MAX_LOTES = 20
const MAX_FORMULARIOS_POR_MINUTO = 15
const CHAVE_CONTAGENS = 'meta_leads_count'

const base = (env) => 'https://painel.interno'
const token = (env) => encodeURIComponent(env.WEBHOOK_VERIFY_TOKEN)

async function chamar(env, caminho) {
  // O host é irrelevante: a chamada vai direto ao próprio Worker pelo binding.
  const res = await env.WORKER_SELF_REFERENCE.fetch(base(env) + caminho, { method: 'POST' })
  const j = await res.json().catch(() => null)
  return { ok: res.ok && j && (j.status === 'ok' || j.ok === true), status: res.status, j }
}

// Varredura completa (todos os formulários ativos, em lotes). Roda uma vez por hora,
// como rede de segurança caso a contagem do Meta atrase em relação aos leads.
async function varreduraCompletaMeta(env, desde) {
  let skip = 0, total = Infinity, lotes = 0, novos = 0, falhas = 0
  while (skip < total && lotes < MAX_LOTES) {
    lotes++
    try {
      const r = await chamar(env, `/api/backfill?token=${token(env)}&only_active=1&since=${desde}&max=50&skip=${skip}&take=${FORMULARIOS_POR_LOTE}`)
      if (!r.ok) { falhas++; console.error('[sync-meta] lote falhou', skip, r.status, r.j?.metaError ?? r.j?.error ?? '') }
      else { total = r.j.totalForms; novos += r.j.imported }
    } catch (e) {
      falhas++
      console.error('[sync-meta] erro no lote', skip, e instanceof Error ? e.message : String(e))
    }
    skip += FORMULARIOS_POR_LOTE
  }
  console.log(`[sync-meta] varredura completa: ${novos} novo(s), ${lotes} lote(s), ${falhas} falha(s)`)
}

// Rotina de todo minuto: 1 consulta lista os formulários com a contagem de leads de
// cada um; só os que mudaram desde a última vez são consultados.
async function sincronizarMeta(env, horaCheia) {
  if (!env.WEBHOOK_VERIFY_TOKEN || !env.META_PAGE_ACCESS_TOKEN || !env.META_PAGE_ID) {
    console.error('[sync-meta] faltam variáveis (WEBHOOK_VERIFY_TOKEN, META_PAGE_ACCESS_TOKEN ou META_PAGE_ID)')
    return
  }
  const desde = Math.floor(Date.now() / 1000) - JANELA_SEGUNDOS
  const lista = await chamar(env, `/api/backfill?token=${token(env)}&only_active=1&list=1`)
  if (!lista.ok) {
    console.error('[sync-meta] não consegui listar os formulários', lista.status, lista.j?.metaError ?? lista.j?.error ?? '')
    return
  }
  const formularios = lista.j.forms ?? []
  const anteriores = (await env.SYNC_STATE.get(CHAVE_CONTAGENS, 'json')) ?? null

  if (horaCheia || anteriores === null) {
    // Primeira vez (sem contagens guardadas) ou hora cheia: varredura completa.
    await varreduraCompletaMeta(env, desde)
    const todas = {}
    for (const f of formularios) todas[f.id] = f.leads_count ?? 0
    await env.SYNC_STATE.put(CHAVE_CONTAGENS, JSON.stringify(todas))
    return
  }

  const mudaram = formularios.filter((f) => (f.leads_count ?? 0) !== anteriores[f.id]).slice(0, MAX_FORMULARIOS_POR_MINUTO)
  if (mudaram.length === 0) return

  const atualizadas = { ...anteriores }
  let novos = 0
  for (const f of mudaram) {
    try {
      const r = await chamar(env, `/api/backfill?token=${token(env)}&form_id=${encodeURIComponent(f.id)}&since=${desde}&max=50`)
      if (r.ok) { atualizadas[f.id] = f.leads_count ?? 0; novos += r.j.imported }
      else console.error('[sync-meta] formulário falhou', f.id, r.status, r.j?.metaError ?? r.j?.error ?? '')
    } catch (e) {
      console.error('[sync-meta] erro no formulário', f.id, e instanceof Error ? e.message : String(e))
    }
  }
  await env.SYNC_STATE.put(CHAVE_CONTAGENS, JSON.stringify(atualizadas))
  console.log(`[sync-meta] ${mudaram.length} formulário(s) mudaram, ${novos} lead(s) novo(s)`)
}

// Leads do formulário do site: o site grava no HubSpot e o painel busca de lá.
// Olha os 200 contatos alterados mais recentemente. Na hora cheia também completa
// respostas de qualificação de leads antigos (até 15).
async function sincronizarSite(env, horaCheia) {
  if (!env.WEBHOOK_VERIFY_TOKEN || !env.HUBSPOT_TOKEN) {
    console.error('[sync-site] faltam variáveis (WEBHOOK_VERIFY_TOKEN ou HUBSPOT_TOKEN)')
    return
  }
  try {
    const r = await chamar(env, `/api/hubspot/site-sync?token=${token(env)}&max=200&enrich=${horaCheia ? 15 : 0}`)
    if (!r.ok) console.error('[sync-site] falhou', r.status, r.j?.error ?? '')
    else if (r.j.imported > 0 || horaCheia) console.log(`[sync-site] ${r.j.imported} novo(s), ${r.j.matched} do formulário em ${r.j.scanned} contatos`)
  } catch (e) {
    console.error('[sync-site] erro', e instanceof Error ? e.message : String(e))
  }
}

export default {
  fetch: handler.fetch,
  async scheduled(controller, env, ctx) {
    const horaCheia = new Date(controller.scheduledTime).getUTCMinutes() === 0
    ctx.waitUntil(Promise.allSettled([sincronizarMeta(env, horaCheia), sincronizarSite(env, horaCheia)]))
  },
}
