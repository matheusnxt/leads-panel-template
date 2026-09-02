import { createClient } from '@supabase/supabase-js'

// Usuários fazem login com "username"; internamente vira um e-mail sintético
// para o Supabase Auth (não há envio de e-mail real). Configurável por empresa.
export const EMAIL_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'leadspanel.app'
export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`

export type Role = 'adm' | 'usuario'

// Política de senha forte (compartilhada entre servidor e UI):
// mín. 8 caracteres, com maiúscula, minúscula, número e símbolo.
export const PASSWORD_RULE = 'A senha precisa ter no mínimo 8 caracteres, com letra maiúscula, minúscula, número e símbolo.'
export function passwordError(pw: string): string | null {
  if (pw.length < 8) return PASSWORD_RULE
  if (!/[a-z]/.test(pw)) return PASSWORD_RULE
  if (!/[A-Z]/.test(pw)) return PASSWORD_RULE
  if (!/[0-9]/.test(pw)) return PASSWORD_RULE
  if (!/[^A-Za-z0-9]/.test(pw)) return PASSWORD_RULE
  return null
}

// Cliente com a service role — SOMENTE no servidor (route handlers).
// Bypassa RLS para criar/listar/excluir usuários.
export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Verifica o token do chamador e exige papel ADM. Retorna o usuário ou null.
export async function requireAdm(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const admin = getAdminClient()

  const { data: userData, error } = await admin.auth.getUser(token)
  if (error || !userData.user) return null

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (profile?.role !== 'adm') return null
  return userData.user
}

// Registra uma ação administrativa no log de atividades (lado servidor)
export async function logAdminAction(callerId: string, action: string) {
  try {
    const admin = getAdminClient()
    const { data: prof } = await admin.from('profiles').select('name, username').eq('id', callerId).single()
    await admin.from('activity_log').insert({
      user_id: callerId,
      actor_name: prof?.name || prof?.username || 'Administrador',
      action,
    })
  } catch { /* silencioso */ }
}
