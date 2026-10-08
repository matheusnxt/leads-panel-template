import { getRange, type DateRangeKey } from './dateRange'
import { CAMPANHAS_EXCLUIDAS_TOKEN } from './exclusions'

// ---------------------------------------------------------------------------
// Camada de dados do funil HubSpot (server-side; token nunca vai ao client).
// Funil: Leads → MQL → SQL → Vendas → Faturamento, cada linha em
// Total / Tráfego / Orgânico, sempre dentro do período selecionado na aba.
//
// Leads, MQL e SQL saem do PAINEL DE LEADS (objeto `leads`).
// Vendas e Faturamento saem de NEGÓCIOS (objeto `deals`).
// ===========================================================================
//  FILTROS — espelham os filtros avançados configurados no HubSpot
// ===========================================================================

// Canal de Entrada que conta como TRÁFEGO PAGO. Orgânico = todo o resto,
// inclusive registros com o campo vazio (igual ao "não é nenhum de" da UI).
export const PAID_CANAIS = ['Formulários Meta', 'Google Ads']

// Propriedades do Painel de Leads (objeto `leads`) desta conta.
// Os rótulos dos estágios estão em inglês, mas são os do pipeline "Novo" e
// "Qualificado" que aparecem traduzidos na interface.
const LEAD_CANAL = 'canal_de_entrada'
const LEAD_MOTIVO = 'motivo_da_perda' // rótulo na tela: "Motivo da Desqualificação"
const LEAD_DATE_NOVO = 'hs_v2_date_entered_new_stage_id_1318266061'
const LEAD_DATE_QUALIFICADO = 'hs_v2_date_entered_qualified_stage_id_233247981'

// MQL = lead do período que NÃO foi desqualificado por nenhum destes motivos.
// ATENÇÃO: são os VALORES internos da propriedade, que diferem do rótulo
// exibido na tela ("Fora de perfil ideal" é gravado como "Fora de perfil").
export const MQL_MOTIVOS_EXCLUIDOS = [
  'Fora de perfil',       // tela: "Fora de perfil ideal"
  'Contato inválido',
  'Já é cliente ativo',
  'Lead Duplicado',
  'Paciente',
]

// Venda = negócio que ENTROU no estágio "Negócio Ganho (Closer)" no período.
// Sem filtro de estágio atual: conta quem passou por ganho, mesmo que o
// negócio tenha sido movido depois. O pipeline Go Premium não entra.
const WON_STAGE_ID = '1157066110'
const WON_DATE_PROP = `hs_v2_date_entered_${WON_STAGE_ID}`
const DEAL_CANAL = 'canal_de_entrada'
const DEAL_AMOUNT = 'amount'

// ===========================================================================

const BASE = 'https://api.hubapi.com'

const SCOPE_ERROR =
  'O token do HubSpot não tem permissão para ler o Painel de Leads. ' +
  'No HubSpot: Configurações → Integrações → Apps privados → (app deste painel) ' +
  '→ Escopos → marcar CRM › Leads › Read.'

function token(): string {
  const t = process.env.HUBSPOT_TOKEN
  if (!t) throw new Error('HUBSPOT_TOKEN não configurado')
  return t
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// A Search API do HubSpot limita requisições por segundo; em vez de estourar,
// espera e tenta de novo.
async function hs<T>(path: string, body?: unknown): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    const res = await fetch(`${BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
    const json = await res.json()

    if (res.status === 429 && tentativa < 5) {
      await sleep(2 ** tentativa * 250)
      continue
    }
    if (res.status === 403 && path.includes('/leads')) throw new Error(SCOPE_ERROR)
    if (!res.ok) throw new Error(json?.message ?? `HubSpot ${res.status}`)
    return json as T
  }
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

// ---- Período → filtro HubSpot ----------------------------------------------
export type RangeInput = { dateKey: DateRangeKey; from?: string; to?: string }

export function rangeFromParams(p: URLSearchParams): RangeInput {
  return {
    dateKey: (p.get('dateKey') ?? 'all') as DateRangeKey,
    from: p.get('from') ?? undefined,
    to: p.get('to') ?? undefined,
  }
}

type Filter = { propertyName: string; operator: string; value?: string; highValue?: string; values?: string[] }
type FilterGroup = { filters: Filter[] }

// Toda linha do funil usa o mesmo período — só muda a propriedade de data.
function periodFilter(range: RangeInput, prop: string): Filter | null {
  const r = getRange(range.dateKey, { from: range.from, to: range.to })
  if (!r.from && !r.to) return null
  const from = r.from ? r.from.getTime() : 0
  const to = r.to ? r.to.getTime() : Date.now()
  return { propertyName: prop, operator: 'BETWEEN', value: String(from), highValue: String(to) }
}

// ---- Tipos expostos --------------------------------------------------------
export type StageRow = { key: string; label: string; total: number; trafego: number; organico: number }
export type Money = { total: number; trafego: number; organico: number }
export type Funnel = {
  stages: StageRow[]
  sales: StageRow
  revenue: Money
  // Preenchido quando o Painel de Leads está inacessível (falta de escopo):
  // Vendas/Faturamento continuam reais, Leads/MQL/SQL vêm zerados.
  leadsError: string | null
}

const zeroStage = (key: string, label: string): StageRow => ({ key, label, total: 0, trafego: 0, organico: 0 })

// ---- Leads excluídos do painel ---------------------------------------------
// Os leads de formulário de curso são identificados pela campanha de origem e
// removidos de todas as etapas do funil. Nada é alterado no HubSpot.
async function idsExcluidos(): Promise<string[]> {
  return cached('leads-excluidos', async () => {
    const ids: string[] = []
    let after: string | undefined
    for (let guard = 0; guard < 20; guard++) {
      const page = await hs<{ results: { id: string }[]; paging?: { next?: { after: string } } }>(
        '/crm/v3/objects/leads/search',
        {
          limit: 100,
          after,
          filterGroups: [{
            filters: [{
              propertyName: 'hs_contact_analytics_source_data_2',
              operator: 'CONTAINS_TOKEN',
              value: `*${CAMPANHAS_EXCLUIDAS_TOKEN}*`,
            }],
          }],
        },
      )
      for (const l of page.results ?? []) ids.push(l.id)
      after = page.paging?.next?.after
      if (!after) break
    }
    return ids
  })
}

// ---- Contagens -------------------------------------------------------------
async function leadsCount(filterGroups: FilterGroup[]): Promise<number> {
  const res = await hs<{ total: number }>('/crm/v3/objects/leads/search', { limit: 1, filterGroups })
  return res.total ?? 0
}

// Uma linha do painel de leads: total no período + recorte de tráfego pago.
// Orgânico sai por subtração, garantindo Total = Tráfego + Orgânico.
async function leadsRow(
  key: string,
  label: string,
  groups: FilterGroup[],
): Promise<StageRow> {
  const paidFilter: Filter = { propertyName: LEAD_CANAL, operator: 'IN', values: PAID_CANAIS }
  const paidGroups = groups.map(g => ({ filters: [...g.filters, paidFilter] }))
  // Em série: a Search API do HubSpot é agressiva com rajadas de chamadas.
  const total = await leadsCount(groups)
  const trafego = await leadsCount(paidGroups)
  return { key, label, total, trafego, organico: Math.max(total - trafego, 0) }
}

// ---- Etapas do painel de leads ---------------------------------------------
async function fetchLeadStages(range: RangeInput): Promise<StageRow[]> {
  const novo = periodFilter(range, LEAD_DATE_NOVO)
  const qualificado = periodFilter(range, LEAD_DATE_QUALIFICADO)

  // Todo lead tem id, então NOT_IN aqui não sofre o problema de valor vazio.
  // Filtros dentro de um mesmo grupo são combinados com E, então a lista pode
  // ser fatiada em vários NOT_IN (o HubSpot limita valores por filtro).
  const excluidos = await idsExcluidos()
  const semCurso: Filter[] = []
  for (let i = 0; i < excluidos.length; i += 100) {
    semCurso.push({ propertyName: 'hs_object_id', operator: 'NOT_IN', values: excluidos.slice(i, i + 100) })
  }

  const baseNovo: Filter[] = novo ? [novo, ...semCurso] : [...semCurso]

  // MQL: "não é nenhum de" na UI do HubSpot inclui quem está sem motivo
  // preenchido; na API, NOT_IN exclui vazios. Os dois grupos (OR) reproduzem
  // o comportamento da tela.
  const mqlGroups: FilterGroup[] = [
    { filters: [...baseNovo, { propertyName: LEAD_MOTIVO, operator: 'NOT_IN', values: MQL_MOTIVOS_EXCLUIDOS }] },
    { filters: [...baseNovo, { propertyName: LEAD_MOTIVO, operator: 'NOT_HAS_PROPERTY' }] },
  ]

  return [
    await leadsRow('leads', 'Leads', [{ filters: baseNovo }]),
    await leadsRow('mql', 'MQL', mqlGroups),
    await leadsRow('sql', 'SQL', [{ filters: qualificado ? [qualificado, ...semCurso] : [...semCurso] }]),
  ]
}

// ---- Vendas e Faturamento (negócios ganhos no período) ----------------------
async function fetchWonDeals(range: RangeInput): Promise<{ sales: StageRow; revenue: Money }> {
  const period = periodFilter(range, WON_DATE_PROP)
  // Sem período (Todo o período) ainda é preciso limitar aos que entraram em
  // ganho alguma vez — a propriedade de data existir já garante isso.
  const filters: Filter[] = period
    ? [period]
    : [{ propertyName: WON_DATE_PROP, operator: 'HAS_PROPERTY' }]

  const sales: StageRow = zeroStage('vendas', 'Vendas')
  const revenue: Money = { total: 0, trafego: 0, organico: 0 }

  let after: string | undefined
  for (let guard = 0; guard < 100; guard++) {
    const page = await hs<{
      results: { properties: Record<string, string> }[]
      paging?: { next?: { after: string } }
    }>('/crm/v3/objects/deals/search', {
      limit: 100,
      after,
      properties: [DEAL_AMOUNT, DEAL_CANAL],
      filterGroups: [{ filters }],
    })

    for (const d of page.results ?? []) {
      const amount = Number(d.properties[DEAL_AMOUNT]) || 0
      const pago = PAID_CANAIS.includes(d.properties[DEAL_CANAL] ?? '')
      sales.total++; revenue.total += amount
      if (pago) { sales.trafego++; revenue.trafego += amount }
      else { sales.organico++; revenue.organico += amount }
    }

    after = page.paging?.next?.after
    if (!after) break
  }

  return { sales, revenue }
}

// ---- Funil completo --------------------------------------------------------
export async function fetchFunnel(range: RangeInput): Promise<Funnel> {
  return cached(`funnel:${JSON.stringify(range)}`, async () => {
    // Vendas/Faturamento não dependem do Painel de Leads: se ele estiver
    // inacessível, o resto da tabela ainda é exibido com dados reais.
    const stagesResult = await fetchLeadStages(range).then(
      stages => ({ stages, error: null as string | null }),
      (e: Error) => ({ stages: null, error: e.message }),
    )
    const deals = await fetchWonDeals(range)

    return {
      stages: stagesResult.stages ?? [zeroStage('leads', 'Leads'), zeroStage('mql', 'MQL'), zeroStage('sql', 'SQL')],
      sales: deals.sales,
      revenue: deals.revenue,
      leadsError: stagesResult.error,
    }
  })
}
