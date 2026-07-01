// Reformata TODOS os telefones da base para o padrão +55 (DD) 9 XXXX-XXXX
// (e DDI correto p/ outros países). Recupera números corrompidos (notação
// científica / malformados) a partir de outro lead com o MESMO email.
//
// Dry-run:  SUPABASE_URL=... SUPABASE_KEY=<service_role> node scripts/migrate-phones.mjs
// Aplicar:  SUPABASE_URL=... SUPABASE_KEY=<service_role> node scripts/migrate-phones.mjs --apply
import { writeFileSync } from 'node:fs'
import { formatPhone } from '../src/lib/phone.ts'

const BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_KEY
const APPLY = process.argv.includes('--apply')
if (!BASE || !KEY) { console.error('Faltam SUPABASE_URL e SUPABASE_KEY (service_role)'); process.exit(1) }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const BR_OK = /^\+55 \(\d{2}\) (\d )?\d{4}-\d{4}$/
const INTL_OK = /^\+\d{1,3} \d+$/
const isClean = (f) => BR_OK.test(f) || INTL_OK.test(f)

async function fetchAll() {
  const out = []; let from = 0
  for (;;) {
    const r = await fetch(`${BASE}/rest/v1/leads?select=id,name,email,phone&order=created_at.asc`, {
      headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    })
    const rows = await r.json(); out.push(...rows)
    if (rows.length < 1000) break; from += 1000
  }
  return out
}

const leads = await fetchAll()
console.log(`Total de leads: ${leads.length}`)

// Mapa email -> telefone limpo (para recuperar corrompidos)
const emailToClean = new Map()
for (const l of leads) {
  const e = (l.email || '').trim().toLowerCase()
  if (!e) continue
  const f = formatPhone(l.phone)
  if (isClean(f) && !emailToClean.has(e)) emailToClean.set(e, f)
}

const changes = []        // { id, name, from, to, recovered }
const unresolved = []      // não deu para limpar nem recuperar
for (const l of leads) {
  const cur = l.phone ?? ''
  let to = formatPhone(cur)
  let recovered = false
  if (!isClean(to)) {
    const e = (l.email || '').trim().toLowerCase()
    const fromTwin = e ? emailToClean.get(e) : null
    if (fromTwin) { to = fromTwin; recovered = true }
    else if (cur.trim()) unresolved.push(l)
  }
  if (to !== cur) changes.push({ id: l.id, name: l.name, from: cur, to, recovered })
}

const sci = changes.filter(c => /\d[eE][+-]?\d/.test(c.from))
console.log(`\nTelefones que mudam: ${changes.length}`)
console.log(`  - notação científica corrigida: ${sci.length}`)
console.log(`  - recuperados via email-twin:   ${changes.filter(c => c.recovered).length}`)
console.log(`  - não resolvidos (ficam como estão): ${unresolved.length}`)

console.log('\nAmostra de mudanças normais (10):')
for (const c of changes.filter(c => !c.recovered).slice(0, 10)) console.log(`  ${JSON.stringify(c.from)} -> ${c.to}`)
console.log('\nAmostra de científicos recuperados (10):')
for (const c of sci.slice(0, 10)) console.log(`  ${c.name}: ${c.from} -> ${c.to}`)
if (unresolved.length) {
  console.log('\nNÃO RESOLVIDOS (telefone malformado, sem email-twin — revisar manual):')
  for (const u of unresolved) console.log(`  id=${u.id} | ${u.name} | ${u.email || '—'} | ${u.phone}`)
}

if (!APPLY) {
  console.log('\n[DRY-RUN] Nada foi gravado. Rode com --apply para aplicar.')
  process.exit(0)
}

// Backup antes de gravar
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backup = leads.map(l => ({ id: l.id, phone: l.phone }))
const backupPath = `scripts/phone-backup-${stamp}.json`
writeFileSync(backupPath, JSON.stringify(backup, null, 0))
console.log(`\nBackup salvo em ${backupPath}`)

// Aplica em lotes com concorrência limitada
let ok = 0, fail = 0
const CONC = 12
for (let i = 0; i < changes.length; i += CONC) {
  const batch = changes.slice(i, i + CONC)
  await Promise.all(batch.map(async (c) => {
    const r = await fetch(`${BASE}/rest/v1/leads?id=eq.${c.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ phone: c.to }),
    })
    if (r.ok) ok++; else { fail++; console.error('FALHA', c.id, r.status, await r.text()) }
  }))
  process.stdout.write(`\r  aplicados: ${ok}/${changes.length}`)
}
console.log(`\nConcluído. Sucesso: ${ok}, falhas: ${fail}`)
