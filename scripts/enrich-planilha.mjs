// Enriquece os leads da aba "Leads Planilhas" que estão sem respostas de
// qualificação (só têm "Data") copiando os custom_questions do MESMO lead
// (mesma pessoa) que existe nas abas Upload/Meta, casando por telefone e,
// como fallback, por email. Preserva os campos já existentes no lead de
// planilha (ex.: "Data"). Assim o scoreLead passa a pontuar na aba Planilhas.
//
// Dry-run:  node --import ./scripts/ts-loader.mjs scripts/enrich-planilha.mjs
// Aplicar:  node --import ./scripts/ts-loader.mjs scripts/enrich-planilha.mjs --apply
import { readFileSync, writeFileSync } from 'node:fs'
import { scoreLead } from '../src/lib/leadScore.ts'
import { formatPhoneBR } from '../src/lib/phone.ts'

const APPLY = process.argv.includes('--apply')
const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8'); const e = {}
for (const l of raw.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, '').trim() }
const BASE = e.NEXT_PUBLIC_SUPABASE_URL
const H = { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}` }

async function all(src) {
  const out = []; let from = 0
  for (;;) {
    const r = await fetch(`${BASE}/rest/v1/leads?source=eq.${src}&select=id,name,phone,email,custom_questions&order=created_at.asc`, { headers: { ...H, Range: `${from}-${from + 999}` } })
    const rows = await r.json(); out.push(...rows); if (rows.length < 1000) break; from += 1000
  }
  return out
}
const normPhone = p => (formatPhoneBR(p || '') || '').replace(/\D/g, '')
const normEmail = em => (em || '').trim().toLowerCase()

const planilha = await all('planilha')
const donors = [...await all('upload'), ...await all('meta')]

// Índices: para cada pessoa (telefone/email) escolhemos o doador MAIS COMPLETO
// (mais respostas de qualificação preenchidas). Assim, se a pessoa aparece com
// um registro rico e outro esparso, pegamos o rico.
const completeness = cq => {
  const keys = Object.keys(cq || {}).map(k => k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  return ['voce e', 'especialidade', 'investimento', 'urgencia', 'decisao'].filter(sig => keys.some(k => k.includes(sig))).length
}
const better = (a, b) => !a || completeness(b.custom_questions) > completeness(a.custom_questions)
const byPhone = new Map(), byEmail = new Map()
for (const d of donors) {
  if (!scoreLead(d)) continue
  const p = normPhone(d.phone); if (p.length >= 10 && better(byPhone.get(p), d)) byPhone.set(p, d)
  const em = normEmail(d.email); if (em && better(byEmail.get(em), d)) byEmail.set(em, d)
}

const updates = []            // { id, name, custom_questions, via }
let alreadyScored = 0, noMatch = 0
for (const l of planilha) {
  if (scoreLead(l)) { alreadyScored++; continue }        // já pontua, não mexe
  const p = normPhone(l.phone), em = normEmail(l.email)
  const donor = (p.length >= 10 && byPhone.get(p)) || (em && byEmail.get(em))
  if (!donor) { noMatch++; continue }
  // Mescla: respostas do doador + campos existentes do lead de planilha (estes vencem).
  const merged = { ...(donor.custom_questions || {}), ...(l.custom_questions || {}) }
  // Só vale a pena se, depois de mesclar, realmente passa a pontuar.
  if (!scoreLead({ custom_questions: merged })) { noMatch++; continue }
  updates.push({ id: l.id, name: l.name, custom_questions: merged, via: (p.length >= 10 && byPhone.get(p)) ? 'telefone' : 'email' })
}

console.log(`planilha total: ${planilha.length}`)
console.log(`  já pontuavam (intactos): ${alreadyScored}`)
console.log(`  serão enriquecidos:      ${updates.length}  (telefone: ${updates.filter(u => u.via === 'telefone').length} | email: ${updates.filter(u => u.via === 'email').length})`)
console.log(`  sem gêmeo (ficam sem score): ${noMatch}`)

const dist = updates.reduce((a, u) => { const s = scoreLead({ custom_questions: u.custom_questions }); a[s.band]++; if (s.star) a.star++; return a }, { red: 0, yellow: 0, green: 0, star: 0 })
console.log(`  distribuição resultante: 🔴 ${dist.red} · 🟡 ${dist.yellow} · 🟢 ${dist.green} · ★ ${dist.star}`)

console.log('\n── Amostra (3) ──')
for (const u of updates.slice(0, 3)) {
  const s = scoreLead({ custom_questions: u.custom_questions })
  console.log(` ${u.name} [${u.via}] -> score ${s.score} (${s.band}${s.star ? ' ★' : ''}) | quals: ${JSON.stringify(u.custom_questions)}`)
}

if (!APPLY) { console.log('\n[DRY-RUN] Nada gravado. Rode com --apply para aplicar.'); process.exit(0) }

// Backup dos custom_questions originais dos afetados
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const affectedIds = new Set(updates.map(u => u.id))
const backup = planilha.filter(l => affectedIds.has(l.id)).map(l => ({ id: l.id, custom_questions: l.custom_questions }))
const backupPath = `scripts/planilha-cq-backup-${stamp}.json`
writeFileSync(backupPath, JSON.stringify(backup))
console.log(`\nBackup salvo em ${backupPath} (${backup.length} leads)`)

let ok = 0, fail = 0
const CONC = 12
for (let i = 0; i < updates.length; i += CONC) {
  const batch = updates.slice(i, i + CONC)
  await Promise.all(batch.map(async u => {
    const r = await fetch(`${BASE}/rest/v1/leads?id=eq.${u.id}`, {
      method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ custom_questions: u.custom_questions }),
    })
    if (r.ok) ok++; else { fail++; if (fail <= 5) console.error('FALHA', u.id, r.status, (await r.text()).slice(0, 200)) }
  }))
  process.stdout.write(`\r  gravados: ${ok}/${updates.length}`)
}
console.log(`\nConcluído. Atualizados: ${ok}, falhas: ${fail}`)
