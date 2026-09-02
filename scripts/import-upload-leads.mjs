// Importa a planilha do "Upload Pannel" para a aba "Leads - Upload" (source='upload').
// Usa EXATAMENTE o mesmo pipeline da UI (rowsToLeads + scoreLead), com paridade
// total: coluna Data -> created_at e coluna Formulário -> form_name.
//
// Dry-run (nada é gravado):  node scripts/import-upload-leads.mjs "/caminho/arquivo.csv"
// Aplicar:                   node scripts/import-upload-leads.mjs "/caminho/arquivo.csv" --apply
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { cellToString, guessMapping, rowsToLeads } from '../src/lib/sheets.ts'
import { scoreLead } from '../src/lib/leadScore.ts'

const DEFAULT_CSV = '/Users/matheus.correa/Desktop/[HealthGo] Todos os leads - Upload Pannel - Página1.csv'
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const csvPath = args.find(a => !a.startsWith('--')) || DEFAULT_CSV
const FORM_NAME = 'Leads Upload'
const SOURCE = 'upload'

// ── Credenciais (lê .env.local) ──────────────────────────────────────────────
function readEnv() {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const env = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return env
}
const env = readEnv()
const BASE = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY
if (!BASE || !KEY) { console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local'); process.exit(1) }

// ── Lê a planilha (UTF-8, mesmo tratamento raw da UploadPanel) ────────────────
const str = readFileSync(csvPath, 'utf8')
const wb = XLSX.read(str, { type: 'string', cellDates: true, raw: true })
const sheet = wb.Sheets[wb.SheetNames[0]]
const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })
const rows = rawRows.map(r => {
  const o = {}
  for (const [k, v] of Object.entries(r)) o[k] = cellToString(v)
  return o
})
console.log(`Arquivo: ${csvPath}`)
console.log(`Linhas na planilha: ${rows.length}`)

// ── Mesmo pipeline da UI ─────────────────────────────────────────────────────
const mapping = { name: '', email: '', phone: '', ...guessMapping(Object.keys(rows[0] ?? {})) }
console.log('Mapeamento auto (nome/email/telefone):', JSON.stringify(mapping))

let leads = rowsToLeads(rows, mapping, FORM_NAME, { mapDate: true, mapForm: true })
  .map(l => ({ ...l, source: SOURCE }))

// Remove linhas de teste óbvias (ex.: "<test lead: dummy data...>")
const isTest = (l) => {
  const blob = [l.name, l.email, ...Object.values(l.custom_questions ?? {})].join(' ').toLowerCase()
  return blob.includes('test lead') || blob.includes('dummy data')
}
const testCount = leads.filter(isTest).length
leads = leads.filter(l => !isTest(l))

// ── Diagnóstico ──────────────────────────────────────────────────────────────
const withDate = leads.filter(l => !l.created_at.startsWith(new Date().toISOString().slice(0, 10))).length
const scored = leads.map(scoreLead).filter(Boolean)
const bands = scored.reduce((a, r) => (a[r.band] = (a[r.band] || 0) + 1, a), {})
console.log(`\nLeads a importar: ${leads.length}  (removidos ${testCount} de teste)`)
console.log(`Com data real da planilha (created_at ≠ hoje): ${withDate}`)
console.log(`Com score calculado: ${scored.length}  ->  faixas:`, bands, `| ★ = ${scored.filter(r => r.star).length}`)

console.log('\n── Amostra (5 leads mapeados + score) ──')
for (const l of leads.slice(0, 5)) {
  const r = scoreLead(l)
  console.log({
    name: l.name, phone: l.phone, email: l.email,
    created_at: l.created_at, form_name: l.form_name,
    campaign: l.campaign, adset: l.adset, ad_name: l.ad_name,
    score: r ? `${r.score} (${r.band}${r.star ? ' ★' : ''})` : 'null',
    custom_questions: l.custom_questions,
  })
}

if (!APPLY) {
  console.log('\n[DRY-RUN] Nada foi gravado. Rode de novo com --apply para importar.')
  process.exit(0)
}

// ── Grava em lotes ───────────────────────────────────────────────────────────
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
let ok = 0, fail = 0
for (let i = 0; i < leads.length; i += 500) {
  const batch = leads.slice(i, i + 500)
  const r = await fetch(`${BASE}/rest/v1/leads`, { method: 'POST', headers: H, body: JSON.stringify(batch) })
  if (r.ok) ok += batch.length
  else { fail += batch.length; console.error('FALHA lote', i, r.status, (await r.text()).slice(0, 300)) }
  process.stdout.write(`\r  gravados: ${ok}/${leads.length}`)
}
console.log(`\nConcluído. Inseridos: ${ok}, falhas: ${fail}`)
