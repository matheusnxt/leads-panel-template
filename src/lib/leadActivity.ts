import { supabase } from './supabase'
import type { Lead } from './supabase'

export type LeadActivity = {
  id: string
  lead_id: string
  user_id: string | null
  user_name: string | null
  action: string
  from_stage: string | null
  to_stage: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const STATUS_LABELS: Record<Lead['status'], string> = {
  novo: 'Novo', em_contato: 'Em Contato', convertido: 'Convertido', perdido: 'Perdido',
}

export function stageLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return STATUS_LABELS[s as Lead['status']] ?? s
}

// Resolve o nome do usuário logado (perfil > email).
async function currentActor(): Promise<{ id: string | null; name: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { id: null, name: null }
    let name = session.user.email ?? 'Usuário'
    const { data: profile } = await supabase
      .from('profiles').select('name, username').eq('id', session.user.id).single()
    if (profile) name = profile.name || profile.username || name
    return { id: session.user.id, name }
  } catch {
    return { id: null, name: null }
  }
}

// Registra uma atividade no card. Nunca lança (não bloqueia a ação).
export async function logLeadActivity(
  leadId: string,
  action: string,
  opts?: { fromStage?: string | null; toStage?: string | null; metadata?: Record<string, unknown> },
) {
  try {
    const actor = await currentActor()
    await supabase.from('lead_activity_log').insert({
      lead_id: leadId,
      user_id: actor.id,
      user_name: actor.name,
      action,
      from_stage: opts?.fromStage ?? null,
      to_stage: opts?.toStage ?? null,
      metadata: opts?.metadata ?? null,
    })
  } catch { /* silencioso */ }
}

// Busca a timeline de um card, mais recente primeiro.
export async function fetchLeadActivity(leadId: string): Promise<LeadActivity[]> {
  const { data, error } = await supabase
    .from('lead_activity_log')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data as LeadActivity[]
}

// Frase legível para uma entrada da timeline.
export function describeActivity(a: LeadActivity): string {
  switch (a.action) {
    case 'created':
      return 'criou o lead'
    case 'stage_change':
      return `moveu de ${stageLabel(a.from_stage)} para ${stageLabel(a.to_stage)}`
    case 'conversion_value':
      return 'registrou o valor de conversão'
    case 'loss_reason':
      return 'registrou o motivo da perda'
    case 'responsible':
      return typeof a.metadata?.responsible === 'string'
        ? `atribuiu o responsável para ${a.metadata.responsible}`
        : 'removeu o responsável'
    default:
      return a.action
  }
}

// Formata a data/hora no padrão DD/MM/YYYY às HH:mm
export function formatActivityDate(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${date} às ${time}`
}
