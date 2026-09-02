import type { DateRangeKey } from './dateRange'

// ---------------------------------------------------------------------------
// Camada de dados do painel Meta Ads (Insights). TUDO roda server-side: o
// token NUNCA vai ao client. As rotas em /api/meta-ads/* chamam estas funções.
// ---------------------------------------------------------------------------

const GRAPH = 'https://graph.facebook.com/v21.0'

function env() {
  const token = process.env.META_ADS_ACCESS_TOKEN
  const account = process.env.META_AD_ACCOUNT_ID
  if (!token || !account) {
    throw new Error('META_ADS_ACCESS_TOKEN / META_AD_ACCOUNT_ID não configurados')
  }
  return { token, act: `act_${account}` }
}

// Action types confirmados nesta conta (ver memória healthgo-meta-ads-insights).
const ACT_LEAD = 'onsite_conversion.lead_grouped'
const ACT_MSG = 'onsite_conversion.messaging_conversation_started_7d'

type Action = { action_type: string; value: string }

function actionVal(actions: Action[] | undefined, type: string): number {
  if (!actions) return 0
  const hit = actions.find(a => a.action_type === type)
  return hit ? Number(hit.value) : 0
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ---- Mapeamento período → parâmetros da Insights API -----------------------
// Usa os próprios date_presets do Meta (no fuso da conta) quando possível.
const PRESET: Partial<Record<DateRangeKey, string>> = {
  all: 'maximum',
  today: 'today',
  yesterday: 'yesterday',
  last3: 'last_3d',
  last7: 'last_7d',
  last14: 'last_14d',
  month: 'this_month',
  lastmonth: 'last_month',
  last3months: 'last_90d',
}

export type RangeInput = { dateKey: DateRangeKey; from?: string; to?: string }

// Extrai o período dos query params das rotas (?dateKey=&from=&to=).
export function rangeFromParams(p: URLSearchParams): RangeInput {
  return {
    dateKey: (p.get('dateKey') ?? 'all') as DateRangeKey,
    from: p.get('from') ?? undefined,
    to: p.get('to') ?? undefined,
  }
}

function timeParams(range: RangeInput): Record<string, string> {
  if (range.dateKey === 'custom' && range.from && range.to) {
    return { time_range: JSON.stringify({ since: range.from, until: range.to }) }
  }
  return { date_preset: PRESET[range.dateKey] ?? 'maximum' }
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const { token } = env()
  const qs = new URLSearchParams({ ...params, access_token: token }).toString()
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { cache: 'no-store' })
  const json = await res.json()
  if (!res.ok || json.error) {
    const msg = json?.error?.message ?? `Graph API ${res.status}`
    throw new Error(msg)
  }
  return json as T
}

// Cache simples em memória (por instância) para não repetir chamadas lentas.
const cache = new Map<string, { at: number; data: unknown }>()
const TTL = 5 * 60 * 1000

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.data as T
  const data = await fn()
  cache.set(key, { at: Date.now(), data })
  return data
}

// ---- Tipos expostos --------------------------------------------------------
export type AccountMetrics = {
  spend: number
  leads: number
  cpl: number
  messages: number
  costPerMsg: number
  reach: number
  impressions: number
  clicks: number
  cpc: number
  ctr: number
  cpm: number
}

export type DailyPoint = { date: string; leads: number; messages: number; clicks: number; spend: number }

export type FunnelData = {
  impressions: number
  reach: number
  clicks: number
  leads: number
  conversations: number
}

export type Overview = { metrics: AccountMetrics; daily: DailyPoint[]; funnel: FunnelData }

export type TableRow = {
  id: string
  name: string
  status: string | null
  spend: number
  leads: number
  cpl: number
  messages: number
  costPerMsg: number
  reach: number
  frequency: number
  impressions: number
  clicks: number
  linkClicks: number
  ctr: number
  cpc: number
  costPerLinkClick: number
  cpm: number
  cpp: number
}

export type CreativeRow = TableRow & {
  thumbnail: string | null
  isVideo: boolean
}

// ---- Insights de conta (métricas + funil) ----------------------------------
type InsightRow = {
  spend?: string; impressions?: string; reach?: string; clicks?: string
  ctr?: string; cpc?: string; cpm?: string; cpp?: string; frequency?: string
  inline_link_clicks?: string; actions?: Action[]
  date_start?: string; campaign_name?: string; adset_name?: string; ad_name?: string
  campaign_id?: string; adset_id?: string; ad_id?: string
}

const ACCOUNT_FIELDS = 'spend,impressions,reach,clicks,ctr,cpc,cpm,actions'

function metricsFrom(r: InsightRow | undefined): AccountMetrics {
  const spend = num(r?.spend)
  const leads = actionVal(r?.actions, ACT_LEAD)
  const messages = actionVal(r?.actions, ACT_MSG)
  return {
    spend,
    leads,
    cpl: leads ? spend / leads : 0,
    messages,
    costPerMsg: messages ? spend / messages : 0,
    reach: num(r?.reach),
    impressions: num(r?.impressions),
    clicks: num(r?.clicks),
    cpc: num(r?.cpc),
    ctr: num(r?.ctr),
    cpm: num(r?.cpm),
  }
}

export async function fetchOverview(range: RangeInput): Promise<Overview> {
  const { act } = env()
  const tp = timeParams(range)
  const key = `overview:${JSON.stringify(range)}`

  return cached(key, async () => {
    // 1) Agregado da conta (métricas + funil).
    const agg = await graph<{ data: InsightRow[] }>(`${act}/insights`, {
      ...tp,
      fields: ACCOUNT_FIELDS,
      level: 'account',
    })
    const row = agg.data?.[0]
    const metrics = metricsFrom(row)

    // 2) Série diária.
    const daily = await graph<{ data: InsightRow[] }>(`${act}/insights`, {
      ...tp,
      fields: 'spend,clicks,actions',
      level: 'account',
      time_increment: '1',
    })
    const series: DailyPoint[] = (daily.data ?? []).map(d => ({
      date: d.date_start ?? '',
      leads: actionVal(d.actions, ACT_LEAD),
      messages: actionVal(d.actions, ACT_MSG),
      clicks: num(d.clicks),
      spend: num(d.spend),
    }))

    const funnel: FunnelData = {
      impressions: metrics.impressions,
      reach: metrics.reach,
      clicks: metrics.clicks,
      leads: metrics.leads,
      conversations: metrics.messages,
    }

    return { metrics, daily: series, funnel }
  })
}

// ---- Tabelas de campanha / conjunto ----------------------------------------
function rowFrom(r: InsightRow, idKey: 'campaign_id' | 'adset_id', nameKey: 'campaign_name' | 'adset_name'): TableRow {
  const spend = num(r.spend)
  const leads = actionVal(r.actions, ACT_LEAD)
  const messages = actionVal(r.actions, ACT_MSG)
  const linkClicks = num(r.inline_link_clicks)
  return {
    id: (r[idKey] as string) ?? '',
    name: (r[nameKey] as string) ?? '—',
    status: null,
    spend,
    leads,
    cpl: leads ? spend / leads : 0,
    messages,
    costPerMsg: messages ? spend / messages : 0,
    reach: num(r.reach),
    frequency: num(r.frequency),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    linkClicks,
    ctr: num(r.ctr),
    cpc: num(r.cpc),
    costPerLinkClick: linkClicks ? spend / linkClicks : 0,
    cpm: num(r.cpm),
    cpp: num(r.cpp),
  }
}

export async function fetchTable(level: 'campaign' | 'adset', range: RangeInput): Promise<TableRow[]> {
  const { act } = env()
  const tp = timeParams(range)
  const key = `table:${level}:${JSON.stringify(range)}`
  const idKey = level === 'campaign' ? 'campaign_id' : 'adset_id'
  const nameKey = level === 'campaign' ? 'campaign_name' : 'adset_name'

  const edge = level === 'campaign' ? 'campaigns' : 'adsets'

  return cached(key, async () => {
    // Insights (métricas) + lista de entidades (status de veiculação), em paralelo.
    const [res, statusRes] = await Promise.all([
      graph<{ data: InsightRow[] }>(`${act}/insights`, {
        ...tp,
        level,
        fields: `${idKey},${nameKey},spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,cpp,actions`,
        limit: '200',
      }),
      graph<{ data: { id: string; effective_status?: string }[] }>(`${act}/${edge}`, {
        fields: 'id,effective_status',
        limit: '500',
      }).catch(() => ({ data: [] as { id: string; effective_status?: string }[] })),
    ])
    const statusById = new Map((statusRes.data ?? []).map(s => [s.id, s.effective_status ?? null]))
    return (res.data ?? [])
      .map(r => rowFrom(r, idKey, nameKey))
      .map(r => ({ ...r, status: statusById.get(r.id) ?? null }))
      .sort((a, b) => b.spend - a.spend)
  })
}

// ---- Criativos (nível ad + capa do criativo) -------------------------------
type CreativeMeta = { thumbnail_url?: string; image_url?: string; video_id?: string }

export async function fetchCreatives(range: RangeInput): Promise<CreativeRow[]> {
  const { act } = env()
  const tp = timeParams(range)
  const key = `creatives:${JSON.stringify(range)}`

  return cached(key, async () => {
    // 1) Métricas por anúncio (top por gasto).
    const res = await graph<{ data: InsightRow[] }>(`${act}/insights`, {
      ...tp,
      level: 'ad',
      fields: 'ad_id,ad_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,cpp,actions',
      limit: '100',
    })
    const rows = (res.data ?? [])
      .map(r => ({ ...rowFrom({ ...r }, 'campaign_id', 'campaign_name'), id: r.ad_id ?? '', name: r.ad_name ?? '—' }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 60)

    if (rows.length === 0) return []

    // 2) Capa do criativo de cada anúncio, em lotes (?ids= aceita no máx. 50;
    //    usamos 25 para tolerar algum id inacessível sem derrubar todo o lote).
    const creatives: Record<string, { effective_status?: string; creative?: CreativeMeta }> = {}
    const ids = rows.map(r => r.id)
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 25) chunks.push(ids.slice(i, i + 25))
    await Promise.all(chunks.map(async chunk => {
      try {
        const part = await graph<Record<string, { effective_status?: string; creative?: CreativeMeta }>>('', {
          ids: chunk.join(','),
          fields: 'effective_status,creative{thumbnail_url,image_url,video_id}',
        })
        Object.assign(creatives, part)
      } catch { /* sem capa não quebra a tabela */ }
    }))

    return rows.map(r => {
      const entry = creatives[r.id]
      const c = entry?.creative
      return {
        ...r,
        status: entry?.effective_status ?? null,
        thumbnail: c?.image_url ?? c?.thumbnail_url ?? null,
        isVideo: Boolean(c?.video_id),
      }
    })
  })
}

// ---- Mídia completa de um anúncio (para o modal) ---------------------------
// O `source` de vídeos da Página não é exposto via token de conta de anúncio,
// então usamos o PREVIEW oficial do anúncio (iframe) — renderiza vídeo ou
// imagem fielmente, com copy e CTA. Fallback: imagem do criativo.
export type CreativeMedia =
  | { type: 'iframe'; src: string }
  | { type: 'image'; url: string }
  | { type: 'none' }

const PREVIEW_FORMATS = ['MOBILE_FEED_STANDARD', 'INSTAGRAM_STANDARD', 'DESKTOP_FEED_STANDARD']

export async function fetchCreativeMedia(adId: string): Promise<CreativeMedia> {
  for (const ad_format of PREVIEW_FORMATS) {
    try {
      const res = await graph<{ data?: { body: string }[] }>(`${adId}/previews`, { ad_format })
      const body = res.data?.[0]?.body
      const m = body?.match(/src="([^"]+)"/)
      if (m) return { type: 'iframe', src: m[1].replace(/&amp;/g, '&') }
    } catch { /* tenta o próximo formato */ }
  }
  try {
    const res = await graph<{ creative?: CreativeMeta }>(adId, { fields: 'creative{image_url,thumbnail_url}' })
    const img = res.creative?.image_url ?? res.creative?.thumbnail_url
    if (img) return { type: 'image', url: img }
  } catch { /* ignora */ }
  return { type: 'none' }
}
