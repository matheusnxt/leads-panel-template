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
