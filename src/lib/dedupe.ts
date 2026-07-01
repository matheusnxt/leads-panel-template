import type { Lead } from './supabase'

export type Submission = { form_name: string; created_at: string; status: Lead['status'] }
export type MergedLead = Lead & {
  conversions: number
  forms: string[]
  submissions: Submission[]
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

// Agrupa leads iguais (mesmo telefone OU email) de forma transitiva.
// Não-destrutivo: o representante é a submissão mais recente.
export function dedupeLeads(leads: Lead[]): MergedLead[] {
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
  for (const rows of groups.values()) {
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const rep = rows[0] // mais recente
    const forms = [...new Set(rows.map(r => r.form_name).filter(Boolean))] as string[]
    merged.push({
      ...rep,
      conversions: rows.length,
      forms,
      submissions: rows.map(r => ({ form_name: r.form_name, created_at: r.created_at, status: r.status })),
    })
  }
  return merged
}
