import type { Lead } from './supabase'
import { formatPhoneBR } from './phone'

const GRAPH = 'https://graph.facebook.com/v21.0'

type FieldData = { name: string; values: string[] }

// Remove acentos, espaços e deixa minúsculo para comparação robusta
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

function isEmail(key: string) {
  return /e-?mail/.test(key)
}

function isPhone(key: string) {
  return /telefone|phone|celular|whatsapp|whats|fone/.test(key)
}

function isName(key: string) {
  // "nome", "name", "full name", "seu nome", "nome completo" — mas NÃO "nome da empresa"
  if (/empresa|clinic|cidade/.test(key)) return false
  return /^nome|full.?name|^name|seu nome/.test(key)
}

export type ParsedLead = {
  name: string
  email: string
  phone: string
  custom_questions: Record<string, string> | null
}

// Leads de teste do Meta vêm com valores como "<test lead: dummy data for X>"
export function isTestLead(fieldData: FieldData[]): boolean {
  return (fieldData ?? []).some(f =>
    (f.values?.[0] ?? '').startsWith('<test lead'),
  )
}

// Transforma o field_data do Meta num lead, identificando nome/email/telefone
// independente de maiúsculas, acentos ou idioma do formulário.
export function parseFieldData(fieldData: FieldData[]): ParsedLead {
  let name = ''
  let email = ''
  let phone = ''
  const custom_questions: Record<string, string> = {}

  for (const { name: rawKey, values } of fieldData ?? []) {
    const value = values?.[0] ?? ''
    if (!value) continue
    const key = normalize(rawKey)

    if (!email && isEmail(key)) {
      email = value
    } else if (!phone && isPhone(key)) {
      phone = value
    } else if (!name && isName(key)) {
      name = value
    } else {
      // mantém o rótulo original (ex.: "Especialidade") para exibir no painel
      custom_questions[rawKey] = normalizeInvestimento(rawKey, value)
    }
  }

  return {
    name,
    email,
    phone,
    custom_questions: Object.keys(custom_questions).length > 0 ? custom_questions : null,
  }
}

// As opções de Investimento do formulário mudaram de 20k para 30k, mas a API
// do Meta devolve o rótulo antigo. Corrige na importação para ficar consistente.
function normalizeInvestimento(rawKey: string, value: string): string {
  if (!normalize(rawKey).includes('investimento')) return value
  const v = value.trim()
  if (v === 'Até R$ 20.000') return 'Até R$ 30.000'
  if (v === 'R$20.000 a R$ 50.000') return 'R$30.000 a R$ 50.000'
  return value
}

// Busca o nome de um formulário (com cache simples em memória por requisição)
export async function fetchFormName(formId: string, token: string): Promise<string> {
  try {
    const res = await fetch(`${GRAPH}/${formId}?fields=name&access_token=${token}`)
    if (res.ok) {
      const data = await res.json()
      if (data.name) return data.name
    }
  } catch { /* usa fallback */ }
  return `Formulário ${formId}`
}

export const UTM_FIELDS = 'field_data,created_time,form_id,campaign_name,adset_name,ad_name,platform'

// Traduz o código da plataforma do Meta
export function platformLabel(p?: string | null): string | null {
  if (!p) return null
  const m: Record<string, string> = { ig: 'Instagram', fb: 'Facebook', an: 'Audience Network', msg: 'Messenger' }
  return m[p] ?? p
}

export type LeadUtm = { platform: string | null; campaign: string | null; adset: string | null; ad_name: string | null }

export function utmFrom(leadData: { campaign_name?: string; adset_name?: string; ad_name?: string; platform?: string }): LeadUtm {
  return {
    platform: platformLabel(leadData.platform),
    campaign: leadData.campaign_name ?? null,
    adset: leadData.adset_name ?? null,
    ad_name: leadData.ad_name ?? null,
  }
}

// Busca os dados de um lead individual pelo leadgen_id
export async function fetchLead(leadgenId: string, token: string) {
  const res = await fetch(`${GRAPH}/${leadgenId}?fields=${UTM_FIELDS}&access_token=${token}`)
  if (!res.ok) return null
  return res.json()
}

export function toLeadRow(
  parsed: ParsedLead,
  form_name: string,
  created_at?: string,
  utm?: LeadUtm,
): Omit<Lead, 'id'> {
  return {
    name: parsed.name,
    email: parsed.email,
    phone: formatPhoneBR(parsed.phone),
    status: 'novo',
    form_name,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    custom_questions: parsed.custom_questions,
    created_at: created_at ?? new Date().toISOString(),
    platform: utm?.platform ?? null,
    campaign: utm?.campaign ?? null,
    adset: utm?.adset ?? null,
    ad_name: utm?.ad_name ?? null,
    responsible: null,
  }
}
