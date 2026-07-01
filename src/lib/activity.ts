import { supabase } from './supabase'

export type ActivityLog = {
  id: string
  user_id: string | null
  actor_name: string | null
  action: string
  link: string | null
  created_at: string
}

// Gera uma URL assinada temporária (5 min) para baixar um arquivo exportado.
// `link` pode ser um caminho do storage (novo) ou uma URL antiga (compatibilidade).
export async function getDownloadUrl(link: string): Promise<string | null> {
  if (/^https?:\/\//.test(link)) return link // entradas antigas (URL pública)
  const { data } = await supabase.storage.from('exports').createSignedUrl(link, 300)
  return data?.signedUrl ?? null
}

// Registra uma ação do usuário logado. Nunca lança erro (não bloqueia a ação).
export async function logActivity(action: string, link?: string | null) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    let actorName = session.user.email ?? 'Usuário'
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, username')
      .eq('id', session.user.id)
      .single()
    if (profile) actorName = profile.name || profile.username || actorName

    await supabase.from('activity_log').insert({
      user_id: session.user.id,
      actor_name: actorName,
      action,
      link: link ?? null,
    })
  } catch { /* silencioso */ }
}
