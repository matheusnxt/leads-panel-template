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

// Converte uma data de planilha em ISO. Aceita o padrão BR d/m/aaaa [hh:mm[:ss]]
// (formato do export do Google Sheets) e cai para Date() em qualquer outro caso
// reconhecível (ISO, etc). Retorna null quando vazio ou irreconhecível.
export function parseSheetDate(raw: unknown): string | null {
  const s = (raw ?? '').toString().trim()
  if (!s) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    const [, d, mo, y, h, mi, se] = m
    const dt = new Date(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(se ?? 0))
    return isNaN(dt.getTime()) ? null : dt.toISOString()
  }
  const iso = new Date(s)
  return isNaN(iso.getTime()) ? null : iso.toISOString()
}

// Opções de mapeamento extra (usadas pela aba "Leads - Upload" p/ paridade total
// com a aba Leads: data real do lead e formulário reais, em vez de now()/arquivo).
export type RowsToLeadsOpts = { mapDate?: boolean; mapForm?: boolean }

// Converte as linhas da planilha em registros prontos para inserir
export function rowsToLeads(
  rows: SheetRow[],
  mapping: Mapping,
  formName: string,
  opts?: RowsToLeadsOpts,
): Omit<Lead, 'id'>[] {
  // Detecta colunas de UTM da planilha (Plataforma / Campanha / Conjunto / Anúncio)
  const headers = Object.keys(rows[0] ?? {})
  const findHeader = (re: RegExp) => headers.find(h => re.test(normalize(h)))
  const hPlatform = findHeader(/plataforma|platform/)
  const hCampaign = findHeader(/campanha|campaign/)
  const hAdset = findHeader(/conjunto|adset|ad set/)
  const hAd = findHeader(/anuncio|^ad$|^ad |criativo/)
  // Mapeamentos extra opcionais: coluna de Data -> created_at, Formulário -> form_name
  const hDate = opts?.mapDate ? findHeader(/^data$|^data |^date$|criado|created/) : undefined
  const hForm = opts?.mapForm ? findHeader(/formulario|^form$|^form /) : undefined

  const known = new Set([mapping.name, mapping.email, mapping.phone, hPlatform, hCampaign, hAdset, hAd, hDate, hForm].filter(Boolean) as string[])

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
      // Data real do lead se a coluna existir e for legível; senão, hora do import.
      const created_at = (hDate ? parseSheetDate(row[hDate]) : null) ?? new Date().toISOString()
      // Formulário real da planilha se existir; senão, o nome do arquivo/planilha.
      const form_name = pick(hForm) ?? formName

      return {
        name,
        email,
        phone: formatPhoneBR(phone),
        status: 'novo' as Lead['status'],
        form_name,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        utm_term: null,
        custom_questions: Object.keys(custom_questions).length > 0 ? custom_questions : null,
        created_at,
        platform: pick(hPlatform),
        campaign: pick(hCampaign),
        adset: pick(hAdset),
        ad_name: pick(hAd),
        responsible: null,
        conversion_value: null,
        loss_reason: null,
        loss_reason_note: null,
      }
    })
    // descarta linhas totalmente vazias
    .filter(l => l.name || l.email || l.phone || l.custom_questions)
}
