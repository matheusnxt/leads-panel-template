// Audita unificações antigas (nome OU telefone OU email) vs nova regra
// (telefone OU email). Lista os grupos que estavam unificados de forma
// ERRADA — ou seja, só se mantinham juntos por causa do nome.
//
// Uso: SUPABASE_URL=... SUPABASE_KEY=<service_role> node scripts/audit-dedupe.mjs

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_KEY
if (!URL || !KEY) {
  console.error('Faltam SUPABASE_URL e SUPABASE_KEY (service_role).')
  process.exit(1)
}

const norm = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

function phoneKey(l) {
  const p = (l.phone || '').replace(/\D/g, '')
  return p.length >= 8 ? 'p:' + p.slice(-11) : null
}
function emailKey(l) {
  const e = (l.email || '').trim().toLowerCase()
  return e ? 'e:' + e : null
}
function nameKey(l) {
  const n = norm(l.name)
  return n ? 'n:' + n : null
}

function keysOld(l) {
  return [phoneKey(l), emailKey(l), nameKey(l)].filter(Boolean)
}
function keysNew(l) {
  return [phoneKey(l), emailKey(l)].filter(Boolean)
}

function groupBy(leads, keysFn) {
  const parent = leads.map((_, i) => i)
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
  const seen = new Map()
  leads.forEach((l, i) => {
    for (const k of keysFn(l)) {
      const j = seen.get(k)
      if (j !== undefined) union(i, j); else seen.set(k, i)
    }
  })
  const groups = new Map()
  leads.forEach((l, i) => {
    const r = find(i)
    const arr = groups.get(r)
    if (arr) arr.push(i); else groups.set(r, [i])
  })
  return [...groups.values()]
}

async function fetchAll() {
  const out = []
  let from = 0
  const page = 1000
  for (;;) {
    const res = await fetch(`${URL}/rest/v1/leads?select=id,name,email,phone,created_at,form_name&order=created_at.asc`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + page - 1}`,
        'Range-Unit': 'items',
      },
    })
    if (!res.ok) { console.error('Erro fetch:', res.status, await res.text()); process.exit(1) }
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < page) break
    from += page
  }
  return out
}

const leads = await fetchAll()
console.log(`Total de linhas de leads: ${leads.length}\n`)

const newGroups = groupBy(leads, keysNew)
const oldGroups = groupBy(leads, keysOld)

// Mapa idx -> id do grupo NOVO
const newGroupOf = new Map()
newGroups.forEach((g, gi) => g.forEach((idx) => newGroupOf.set(idx, gi)))

// Para cada grupo ANTIGO, ver em quantos grupos NOVOS ele se quebra.
// Se quebra em >1, esse grupo foi unificado de forma ERRADA (só o nome o unia).
const wrong = []
for (const g of oldGroups) {
  const distinctNew = new Set(g.map((idx) => newGroupOf.get(idx)))
  if (distinctNew.size > 1) {
    wrong.push(g)
  }
}

console.log(`Pessoas (grupos) na regra ANTIGA: ${oldGroups.length}`)
console.log(`Pessoas (grupos) na regra NOVA:   ${newGroups.length}`)
console.log(`Grupos unificados de forma ERRADA (só o nome os unia): ${wrong.length}\n`)

let totalLinhas = 0
wrong
  .sort((a, b) => b.length - a.length)
  .forEach((g, i) => {
    const rows = g.map((idx) => leads[idx])
    totalLinhas += rows.length
    const nome = rows[0].name
    console.log(`\n=== Grupo errado #${i + 1}: "${nome}" — ${rows.length} submissões, vira ${new Set(g.map((idx) => newGroupOf.get(idx))).size} pessoas distintas ===`)
    for (const r of rows) {
      console.log(`  • ${r.name} | tel: ${r.phone || '—'} | email: ${r.email || '—'} | ${r.form_name || ''} | ${r.created_at?.slice(0, 10)}`)
    }
  })

console.log(`\n----------------------------------------`)
console.log(`Resumo: ${wrong.length} agrupamentos errados, envolvendo ${totalLinhas} submissões de leads.`)
