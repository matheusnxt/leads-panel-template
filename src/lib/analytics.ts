import type { Lead } from './supabase'

export type Slice = { label: string; value: number }

// Paleta com bom contraste em tema claro e escuro
export const PALETTE = [
  '#5CA0D9', '#34D399', '#F59E0B', '#A78BFA', '#F472B6',
  '#22D3EE', '#FB7185', '#84CC16', '#FBBF24', '#60A5FA',
  '#2DD4BF', '#C084FC',
]

export const STATUS_LABELS: Record<Lead['status'], string> = {
  novo: 'Novo',
  em_contato: 'Em Contato',
  convertido: 'Convertido',
  perdido: 'Perdido',
}

// Lista de perguntas (colunas) presentes nos custom_questions dos leads,
// ordenadas pela quantidade de leads que responderam.
export function questionFields(leads: Lead[]): string[] {
  const counts = new Map<string, number>()
  for (const l of leads) {
    for (const k of Object.keys(l.custom_questions ?? {})) {
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
}

// Distribuição de respostas de uma pergunta (top N + "Outros")
export function distribution(leads: Lead[], key: string, topN = 8): Slice[] {
  const counts = new Map<string, number>()
  for (const l of leads) {
    const v = l.custom_questions?.[key]
    if (!v) continue
    const val = String(v).trim()
    if (!val) continue
    counts.set(val, (counts.get(val) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (sorted.length <= topN) return sorted.map(([label, value]) => ({ label, value }))
  const top = sorted.slice(0, topN)
  const rest = sorted.slice(topN).reduce((acc, [, v]) => acc + v, 0)
  const result = top.map(([label, value]) => ({ label, value }))
  if (rest > 0) result.push({ label: 'Outros', value: rest })
  return result
}

export function statusDistribution(leads: Lead[]): Slice[] {
  const counts: Record<string, number> = {}
  for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1
  return (['novo', 'em_contato', 'convertido', 'perdido'] as const)
    .map(s => ({ label: STATUS_LABELS[s], value: counts[s] ?? 0 }))
    .filter(s => s.value > 0)
}

// ── Análise de motivo de perda ───────────────────────────────────────────────
// Só considera leads em "perdido" com loss_reason preenchido; conta os sem
// motivo separadamente (nunca assume default).
export type LossStats = { slices: Slice[]; total: number; missing: number; top: Slice | null }
export function lossReasonStats(leads: Lead[]): LossStats {
  const lost = leads.filter(l => l.status === 'perdido')
  const counts = new Map<string, number>()
  let missing = 0
  for (const l of lost) {
    if (!l.loss_reason) { missing++; continue }
    counts.set(l.loss_reason, (counts.get(l.loss_reason) ?? 0) + 1)
  }
  const slices = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }))
  const total = slices.reduce((a, s) => a + s.value, 0)
  return { slices, total, missing, top: slices[0] ?? null }
}

// ── Análise de faturamento ───────────────────────────────────────────────────
// Só soma convertidos com conversion_value preenchido; reporta os sem valor.
export type RevenueStats = { total: number; count: number; ticket: number; missing: number }
export function revenueStats(leads: Lead[]): RevenueStats {
  const conv = leads.filter(l => l.status === 'convertido')
  const withVal = conv.filter(l => l.conversion_value != null)
  const total = withVal.reduce((a, l) => a + (l.conversion_value ?? 0), 0)
  const count = withVal.length
  return { total, count, ticket: count ? total / count : 0, missing: conv.length - count }
}

// Evolução do faturamento ao longo do período, agrupado por dia/semana/mês
// conforme o tamanho do intervalo.
export type TrendPoint = { label: string; value: number }
type Range = { from: Date | null; to: Date | null }
type Unit = 'dia' | 'semana' | 'mês'

const DAY = 86400000
function startOfDay(t: number) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
function startOfWeek(t: number) {
  const d = new Date(startOfDay(t))
  const dow = (d.getDay() + 6) % 7 // segunda = 0
  d.setDate(d.getDate() - dow)
  return d.getTime()
}
function startOfMonth(t: number) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime() }

function bucketOf(t: number, unit: Unit) {
  return unit === 'dia' ? startOfDay(t) : unit === 'semana' ? startOfWeek(t) : startOfMonth(t)
}
function nextBucket(t: number, unit: Unit) {
  const d = new Date(t)
  if (unit === 'dia') d.setDate(d.getDate() + 1)
  else if (unit === 'semana') d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + 1)
  return d.getTime()
}
function bucketLabel(t: number, unit: Unit) {
  const d = new Date(t)
  if (unit === 'mês') return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function revenueTrend(leads: Lead[], range: Range): { points: TrendPoint[]; unit: Unit } {
  const conv = leads.filter(l => l.status === 'convertido' && l.conversion_value != null)
  if (conv.length === 0) return { points: [], unit: 'dia' }
  const times = conv.map(l => new Date(l.created_at).getTime())
  const from = range.from ? range.from.getTime() : Math.min(...times)
  const to = range.to ? range.to.getTime() : Math.max(...times) + DAY
  const spanDays = (to - from) / DAY
  const unit: Unit = spanDays <= 31 ? 'dia' : spanDays <= 130 ? 'semana' : 'mês'

  // buckets contínuos (inclui zeros) para um gráfico legível
  const sums = new Map<number, number>()
  for (const l of conv) {
    const b = bucketOf(new Date(l.created_at).getTime(), unit)
    sums.set(b, (sums.get(b) ?? 0) + (l.conversion_value ?? 0))
  }
  const points: TrendPoint[] = []
  let cursor = bucketOf(from, unit)
  const end = bucketOf(to - 1, unit)
  let guard = 0
  while (cursor <= end && guard++ < 400) {
    points.push({ label: bucketLabel(cursor, unit), value: sums.get(cursor) ?? 0 })
    cursor = nextBucket(cursor, unit)
  }
  return { points, unit }
}

// Comparativo do faturamento vs. período anterior equivalente.
// null quando o range é "todo o período" (sem janela anterior comparável).
export type RevenueComparison = { current: number; previous: number; deltaPct: number | null }
export function revenueComparison(leads: Lead[], range: Range): RevenueComparison | null {
  if (!range.from) return null
  const from = range.from
  const to = range.to ?? new Date()
  const spanMs = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - spanMs)
  const sumIn = (a: Date, b: Date) =>
    leads
      .filter(l => l.status === 'convertido' && l.conversion_value != null)
      .filter(l => {
        const t = new Date(l.created_at).getTime()
        return t >= a.getTime() && t < b.getTime()
      })
      .reduce((s, l) => s + (l.conversion_value ?? 0), 0)
  const current = sumIn(from, to)
  const previous = sumIn(prevFrom, from)
  const deltaPct = previous === 0 ? (current > 0 ? null : 0) : ((current - previous) / previous) * 100
  return { current, previous, deltaPct }
}
