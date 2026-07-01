import type { Lead } from './supabase'
import { formatPhoneBR } from './phone'

export type SheetRow = Record<string, string>

// Converte o valor BRUTO de uma célula (lido com raw:true) para texto.
// Crucial para telefones: lê o número inteiro (ex.: 5562982482713) sem deixar
// o Excel transformá-lo em notação científica ("5.56298E+12").
export function cellToString(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toLocaleDateString('pt-BR')
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v)
  return String(v).trim()
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// Tenta adivinhar qual cabeçalho corresponde a nome / email / telefone
export function guessMapping(headers: string[]): { name?: string; email?: string; phone?: string } {
  const map: { name?: string; email?: string; phone?: string } = {}
  for (const h of headers) {
    const k = normalize(h)
    if (!map.email && /e-?mail/.test(k)) map.email = h
    else if (!map.phone && /telefone|phone|celular|whatsapp|whats|fone|contato/.test(k)) map.phone = h
    else if (!map.name && (/^nome|full.?name|^name|seu nome/.test(k)) && !/empresa/.test(k)) map.name = h
  }
  return map
}

export type Mapping = { name: string; email: string; phone: string }

// Converte as linhas da planilha em registros prontos para inserir
export function rowsToLeads(
  rows: SheetRow[],
  mapping: Mapping,
  formName: string,
): Omit<Lead, 'id'>[] {
  // Detecta colunas de UTM da planilha (Plataforma / Campanha / Conjunto / Anúncio)
  const headers = Object.keys(rows[0] ?? {})
  const findHeader = (re: RegExp) => headers.find(h => re.test(normalize(h)))
  const hPlatform = findHeader(/plataforma|platform/)
  const hCampaign = findHeader(/campanha|campaign/)
  const hAdset = findHeader(/conjunto|adset|ad set/)
  const hAd = findHeader(/anuncio|^ad$|^ad |criativo/)

  const known = new Set([mapping.name, mapping.email, mapping.phone, hPlatform, hCampaign, hAdset, hAd].filter(Boolean) as string[])

  return rows
    .map(row => {
      const name  = (row[mapping.name]  ?? '').toString().trim()
      const email = (row[mapping.email] ?? '').toString().trim()
      const phone = (row[mapping.phone] ?? '').toString().trim()

      const custom_questions: Record<string, string> = {}
      for (const [key, value] of Object.entries(row)) {
        if (known.has(key)) continue
        const v = (value ?? '').toString().trim()
        if (v) custom_questions[key] = v
      }
      const pick = (h?: string) => (h && row[h] ? String(row[h]).trim() : null)

      return {
        name,
        email,
        phone: formatPhoneBR(phone),
        status: 'novo' as Lead['status'],
        form_name: formName,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        utm_term: null,
        custom_questions: Object.keys(custom_questions).length > 0 ? custom_questions : null,
        created_at: new Date().toISOString(),
        platform: pick(hPlatform),
        campaign: pick(hCampaign),
        adset: pick(hAdset),
        ad_name: pick(hAd),
        responsible: null,
      }
    })
    // descarta linhas totalmente vazias
    .filter(l => l.name || l.email || l.phone || l.custom_questions)
}
