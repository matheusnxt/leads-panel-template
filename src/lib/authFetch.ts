import { supabase } from '@/lib/supabase'

// fetch que envia o token da sessão do usuário logado. As rotas /api/meta-ads/* e
// /api/hubspot/funnel exigem esse token (apenas administradores).
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  const token = data.session?.access_token
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
