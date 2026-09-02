import { getRange, inRange, type DateRangeKey } from './dateRange'
import { dedupeLeads, CONVERSION_WINDOW_DAYS } from './dedupe'
import type { Lead } from './supabase'

// ---------------------------------------------------------------------------
// Camada de dados do funil HubSpot (server-side; token nunca vai ao client).
// O funil: Leads → MQL → SQL → Vendas → Faturamento, cada um em Total / Tráfego
// / Orgânico. Cruza com Meta Ads em outra camada (custo por etapa + ROAS).
// ===========================================================================
//  BLOCO DE CONFIGURAÇÃO  — AJUSTAR QUANDO O CLIENTE PASSAR OS FILTROS REAIS
// ===========================================================================

// Enquanto for `false`, o funil NÃO consulta nada e devolve tudo ZERADO — sem
// filtros e sem cálculos. Virar `true` quando os filtros oficiais forem definidos.
export const FILTERS_CONFIGURED = false

// Valores da propriedade `origem` (Canal de Entrada) considerados TRÁFEGO PAGO.
// Orgânico = tudo que não é pago (calculado por subtração: total − tráfego).
export const PAID_ORIGEM = ['Meta Ads', 'Google Ads', 'LinkedIn Ads', 'Formulários Meta']

// Etapas de CONTATO. `lifecycle` = valores de lifecyclestage que contam como
// "alcançou a etapa" (aproximação cumulativa, pois a conta não tem histórico de
// data por etapa). null = todos os contatos criados no período.
// >>> PLACEHOLDER: o cliente vai estipular os filtros de MQL e SQL. <<<
type ContactStage = { key: string; label: string; lifecycle: string[] | null }
export const CONTACT_STAGES: ContactStage[] = [
  { key: 'leads', label: 'Leads', lifecycle: null },
  { key: 'mql', label: 'MQL', lifecycle: ['marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer', 'evangelist'] },
  { key: 'sql', label: 'SQL', lifecycle: ['salesqualifiedlead', 'opportunity', 'customer', 'evangelist'] },
]

// Estágios de deal considerados VENDA (ganho). Closer: Negócio Ganho; Go Premium: Ganho.
export const WON_DEAL_STAGES = ['1157066110', '1284036421']

// ===========================================================================

const BASE = 'https://api.hubapi.com'

function token(): string {
  const t = process.env.HUBSPOT_TOKEN
  if (!t) throw new Error('HUBSPOT_TOKEN não configurado')
  return t
}

async function hs<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.message ?? `HubSpot ${res.status}`)
  return json as T
}

// Cache em memória (por instância) — as buscas são lentas.
const cache = new Map<string, { at: number; data: unknown }>()
const TTL = 5 * 60 * 1000
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.data as T
  const data = await fn()
  cache.set(key, { at: Date.now(), data })
  return data
}

// ---- Período → filtros HubSpot ---------------------------------------------
export type RangeInput = { dateKey: DateRangeKey; from?: string; to?: string }

export function rangeFromParams(p: URLSearchParams): RangeInput {
  return {
    dateKey: (p.get('dateKey') ?? 'all') as DateRangeKey,
    from: p.get('from') ?? undefined,
    to: p.get('to') ?? undefined,
  }
}

type Filter = { propertyName: string; operator: string; value?: string; highValue?: string; values?: string[] }

function periodFilter(range: RangeInput, prop: string): Filter | null {
  const r = getRange(range.dateKey, { from: range.from, to: range.to })
  if (!r.from && !r.to) return null
  const from = r.from ? r.from.getTime() : 0
  const to = r.to ? r.to.getTime() : Date.now()
  return { propertyName: prop, operator: 'BETWEEN', value: String(from), highValue: String(to) }
}

// ---- Contagem de contatos (Search API devolve `total`) ---------------------
async function contactTotal(filters: Filter[]): Promise<number> {
  const res = await hs<{ total: number }>('/crm/v3/objects/contacts/search', {
    limit: 1,
    filterGroups: [{ filters }],
  })
  return res.total ?? 0
}

// Valor de hs_analytics_source (Original Traffic Source) que representa a tag
// "Social Pago" (Paid Social) do HubSpot → conta como TRÁFEGO.
const SOCIAL_PAGO = 'PAID_SOCIAL'

// ---- Tipos expostos --------------------------------------------------------
// `divergence` só é preenchido na etapa Leads: total − (tráfego+orgânico), ou
// seja, leads da aba Leads que não foram encontrados no HubSpot.
export type StageRow = { key: string; label: string; total: number; trafego: number; organico: number; divergence?: number }
export type Money = { total: number; trafego: number; organico: number }
export type Funnel = { configured: boolean; stages: StageRow[]; sales: StageRow; revenue: Money }

const zeroStage = (key: string, label: string): StageRow => ({ key, label, total: 0, trafego: 0, organico: 0 })

// ---- Etapa Leads -----------------------------------------------------------
// Total = leads da aba Leads (source='meta', deduplicados) no período.
// Tráfego = contagem DIRETA de contatos com a tag Social Pago no HubSpot (período).
// Orgânico = contagem de contatos SEM a tag no mesmo período (total − tráfego).
// divergence = total − (tráfego+orgânico); pode ser "a mais" (HubSpot > aba Leads).

// Busca os leads Meta direto no Supabase (server-side, service role).
async function fetchMetaLeads(): Promise<Lead[]> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) throw new Error('Supabase não configurado (URL/service role)')
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const out: Lead[] = []
  let from = 0
  for (;;) {
    const res = await fetch(`${base}/rest/v1/leads?source=eq.meta&select=*&order=created_at.desc`, {
      headers: { ...headers, Range: `${from}-${from + 999}` }, cache: 'no-store',
    })
    const rows = (await res.json()) as Lead[]
    if (!Array.isArray(rows) || rows.length === 0) break
    out.push(...rows)
    if (rows.length < 1000) break
    from += 1000
  }
  return out
}

async function fetchLeadsRow(range: RangeInput): Promise<StageRow> {
  // Total = leads da aba Leads (Meta), deduplicados, no período.
  const merged = dedupeLeads(await fetchMetaLeads(), CONVERSION_WINDOW_DAYS)
  const r = getRange(range.dateKey, { from: range.from, to: range.to })
  const total = merged.filter(l => inRange(l.created_at, r)).length

  // Tráfego/Orgânico = contagem DIRETA no HubSpot no mesmo período (por createdate),
  // sem cruzar com a aba Leads. Tráfego = contatos com a tag Social Pago;
  // Orgânico = contatos sem a tag (todos os demais no período).
  const period = periodFilter(range, 'createdate')
  const base: Filter[] = period ? [period] : []
  const [contatos, trafego] = await Promise.all([
    contactTotal(base),
    contactTotal([...base, { propertyName: 'hs_analytics_source', operator: 'EQ', value: SOCIAL_PAGO }]),
  ])
  const organico = Math.max(contatos - trafego, 0)
  return { key: 'leads', label: 'Leads', total, trafego, organico, divergence: total - (trafego + organico) }
}

// ---- Funil completo --------------------------------------------------------
export async function fetchFunnel(range: RangeInput): Promise<Funnel> {
  return cached(`funnel:${JSON.stringify(range)}`, async () => {
    // Etapa Leads: já definida (aba Leads × HubSpot Social Pago) — sempre real.
    const leadsRow = await fetchLeadsRow(range)

    // MQL/SQL/Vendas/Faturamento seguem aguardando os filtros oficiais do cliente.
    if (!FILTERS_CONFIGURED) {
      return {
        configured: false,
        stages: [leadsRow, zeroStage('mql', 'MQL'), zeroStage('sql', 'SQL')],
        sales: zeroStage('vendas', 'Vendas'),
        revenue: { total: 0, trafego: 0, organico: 0 },
      }
    }

    // (Caminho ligado quando os filtros de MQL/SQL/Vendas forem oficializados.)
    const period = periodFilter(range, 'createdate')
    const stages: StageRow[] = [leadsRow]
    for (const st of CONTACT_STAGES.filter(s => s.key !== 'leads')) {
      const filters: Filter[] = []
      if (st.lifecycle) filters.push({ propertyName: 'lifecyclestage', operator: 'IN', values: st.lifecycle })
      if (period) filters.push(period)
      const [total, trafego] = await Promise.all([
        contactTotal(filters),
        contactTotal([...filters, { propertyName: 'origem', operator: 'IN', values: PAID_ORIGEM }]),
      ])
      stages.push({ key: st.key, label: st.label, total, trafego, organico: Math.max(total - trafego, 0) })
    }
    const deals = await fetchWonDeals(range)
    return { configured: true, stages, sales: deals.sales, revenue: deals.revenue }
  })
}

// ---- Deals ganhos: contagem + faturamento, divididos por origem do contato --
type DealLite = { id: string; amount: number }

async function fetchWonDeals(range: RangeInput): Promise<{ sales: StageRow; revenue: Money }> {
  const period = periodFilter(range, 'closedate')
  const filters: Filter[] = [{ propertyName: 'dealstage', operator: 'IN', values: WON_DEAL_STAGES }]
  if (period) filters.push(period)

  // 1) Pagina todos os deals ganhos do período (id + amount).
  const deals: DealLite[] = []
  let after: string | undefined
  for (let guard = 0; guard < 100; guard++) {
    const page = await hs<{ results: { id: string; properties: Record<string, string> }[]; paging?: { next?: { after: string } } }>(
      '/crm/v3/objects/deals/search',
      { limit: 100, after, properties: ['amount'], filterGroups: [{ filters }], sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }] },
    )
    for (const d of page.results ?? []) deals.push({ id: d.id, amount: Number(d.properties.amount) || 0 })
    after = page.paging?.next?.after
    if (!after) break
  }

  // 2) deal → contato associado (v4 batch), depois contato → origem (v3 batch).
  const origemByDeal = await origemForDeals(deals.map(d => d.id))

  const sales: StageRow = { key: 'vendas', label: 'Vendas', total: 0, trafego: 0, organico: 0 }
  const revenue: Money = { total: 0, trafego: 0, organico: 0 }
  for (const d of deals) {
    const paid = PAID_ORIGEM.includes(origemByDeal[d.id] ?? '')
    sales.total++; revenue.total += d.amount
    if (paid) { sales.trafego++; revenue.trafego += d.amount }
    else { sales.organico++; revenue.organico += d.amount }
  }
  return { sales, revenue }
}

// Mapeia dealId → origem do primeiro contato associado.
async function origemForDeals(dealIds: string[]): Promise<Record<string, string>> {
  if (dealIds.length === 0) return {}
  const dealToContact: Record<string, string> = {}
  for (let i = 0; i < dealIds.length; i += 100) {
    const chunk = dealIds.slice(i, i + 100)
    try {
      const res = await hs<{ results: { from: { id: string }; to: { toObjectId: string }[] }[] }>(
        '/crm/v4/associations/deals/contacts/batch/read',
        { inputs: chunk.map(id => ({ id })) },
      )
      for (const r of res.results ?? []) {
        const cid = r.to?.[0]?.toObjectId
        if (cid) dealToContact[r.from.id] = String(cid)
      }
    } catch { /* deals sem contato ficam sem origem → contam como orgânico */ }
  }

  const contactIds = [...new Set(Object.values(dealToContact))]
  const origemByContact: Record<string, string> = {}
  for (let i = 0; i < contactIds.length; i += 100) {
    const chunk = contactIds.slice(i, i + 100)
    try {
      const res = await hs<{ results: { id: string; properties: Record<string, string> }[] }>(
        '/crm/v3/objects/contacts/batch/read',
        { inputs: chunk.map(id => ({ id })), properties: ['origem'] },
      )
      for (const c of res.results ?? []) origemByContact[c.id] = c.properties.origem ?? ''
    } catch { /* ignora */ }
  }

  const out: Record<string, string> = {}
  for (const [deal, contact] of Object.entries(dealToContact)) out[deal] = origemByContact[contact] ?? ''
  return out
}
