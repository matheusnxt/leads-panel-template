import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Lead = {
  id: string
  name: string
  email: string
  phone: string
  status: 'novo' | 'em_contato' | 'convertido' | 'perdido'
  form_name: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  custom_questions: Record<string, string> | null
  created_at: string
  // Origem do anúncio (Meta)
  platform: string | null
  campaign: string | null
  adset: string | null
  ad_name: string | null
  // Responsável pelo atendimento
  responsible: string | null
  // Valor do fechamento (stage Convertido) — BRL decimal
  conversion_value: number | null
  // Motivo da perda (stage Perdido) + observação livre para "Outro"
  loss_reason: string | null
  loss_reason_note: string | null
}
