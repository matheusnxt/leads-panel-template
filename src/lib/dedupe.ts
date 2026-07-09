import type { Lead } from './supabase'

export type Submission = { form_name: string; created_at: string; status: Lead['status'] }
// Referência leve a um card anterior da mesma pessoa (janela de conversão passada).
export type PriorCapture = { id: string; created_at: string; forms: string[]; conversions: number }
export type MergedLead = Lead & {
  conversions: number
  forms: string[]
  submissions: Submission[]
  // Cards anteriores da mesma pessoa (janelas passadas), do mais recente ao mais antigo.
  // Vazio quando este é o primeiro card da pessoa.
  priorCaptures: PriorCapture[]
}

// Chaves de identidade de um lead (telefone ou email). Qualquer uma que
// coincida EXATAMENTE entre dois leads os torna a mesma pessoa.
// O nome NÃO é mais usado como critério: nomes básicos (ex.: "Vanessa")
// uniam pessoas diferentes que só compartilhavam o primeiro nome.
function keysOf(l: Lead): string[] {
  const keys: string[] = []
  const phone = (l.phone || '').replace(/\D/g, '')
  if (phone.length >= 8) keys.push('p:' + phone.slice(-11)) // número nacional
  const email = (l.email || '').trim().toLowerCase()
  if (email) keys.push('e:' + email)
  return keys
}

// Janela padrão (dias) para agrupar reconversões da mesma pessoa num só card.
export const CONVERSION_WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// Dado o conjunto de submissões de UMA pessoa, quebra em janelas de tempo.
// Regra HealthGo: a 1ª conversão "abre" um card válido por `windowDays` dias
// corridos; conversões dentro dessa janela somam na contagem. A primeira
// conversão fora da janela abre um card novo (reinicia a janela), e assim por diante.
function splitByWindow(rows: Lead[], windowDays: number): Lead[][] {
  const asc = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const windows: Lead[][] = []
  let current: Lead[] = []
  let anchor = 0 // timestamp da 1ª conversão da janela atual
  for (const r of asc) {
    const t = new Date(r.created_at).getTime()
    if (current.length === 0 || t - anchor <= windowDays * DAY_MS) {
      if (current.length === 0) anchor = t
      current.push(r)
    } else {
      windows.push(current)
      current = [r]
      anchor = t
    }
  }
  if (current.length) windows.push(current)
  return windows
}

// Monta o card (MergedLead) a partir das submissões de UMA janela.
function buildCard(rows: Lead[]): MergedLead {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const rep = sorted[0] // mais recente da janela → representa o card e volta ao topo
  const forms = [...new Set(sorted.map(r => r.form_name).filter(Boolean))] as string[]
  return {
    ...rep,
    conversions: sorted.length,
    forms,
    submissions: sorted.map(r => ({ form_name: r.form_name, created_at: r.created_at, status: r.status })),
    priorCaptures: [],
  }
}

// Agrupa leads iguais (mesmo telefone OU email) de forma transitiva.
// Não-destrutivo: o representante é a submissão mais recente.
// `windowDays`: se informado, reconversões da mesma pessoa (qualquer formulário)
// separadas por mais que essa janela viram cards distintos (regra HealthGo), e
// cada card novo referencia os anteriores em `priorCaptures`. Sem o parâmetro,
// mantém 1 card por pessoa — usado pelo Analytics para contar pessoas únicas.
export function dedupeLeads(leads: Lead[], windowDays?: number): MergedLead[] {
  const parent = leads.map((_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
    return x
  }
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  // Une leads que compartilham qualquer chave
  const seen = new Map<string, number>()
  leads.forEach((l, i) => {
    for (const k of keysOf(l)) {
      const j = seen.get(k)
      if (j !== undefined) union(i, j)
      else seen.set(k, i)
    }
  })

  // Agrupa por raiz
  const groups = new Map<number, Lead[]>()
  leads.forEach((l, i) => {
    const r = find(i)
    const arr = groups.get(r)
    if (arr) arr.push(l); else groups.set(r, [l])
  })

  const merged: MergedLead[] = []
  for (const personRows of groups.values()) {
    // Cada pessoa vira 1+ cards conforme a janela de conversão (qualquer formulário).
    // splitByWindow devolve as janelas em ordem cronológica (mais antiga → mais recente).
    const windows = windowDays ? splitByWindow(personRows, windowDays) : [personRows]
    const cards = windows.map(buildCard)
    cards.forEach((card, i) => {
      // Cards anteriores desta pessoa, do mais recente ao mais antigo.
      card.priorCaptures = cards
        .slice(0, i)
        .reverse()
        .map(c => ({ id: c.id, created_at: c.created_at, forms: c.forms, conversions: c.conversions }))
      merged.push(card)
    })
  }
  return merged
}
