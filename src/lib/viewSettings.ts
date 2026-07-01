import { supabase } from './supabase'

export type ColumnConfig = { order: string[]; hidden: string[] }

// user_id sentinela para o registro de padrão global
export const GLOBAL_ID = '00000000-0000-0000-0000-000000000000'

const LS_KEY = (source: string) => `app-cols-${source}`

// Carrega a config de colunas: 1º a do próprio usuário, 2º o padrão global,
// 3º o localStorage, senão null (usa o padrão embutido).
export async function loadColumnConfig(source: string): Promise<ColumnConfig | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user.id

  const { data } = await supabase
    .from('view_settings')
    .select('user_id, columns')
    .eq('source', source)

  if (data && data.length > 0) {
    const own = uid ? data.find(r => r.user_id === uid) : null
    const global = data.find(r => r.user_id === GLOBAL_ID)
    const chosen = own ?? global
    if (chosen?.columns) return chosen.columns as ColumnConfig
  }

  try {
    const raw = localStorage.getItem(LS_KEY(source))
    if (raw) return JSON.parse(raw)
  } catch { /* ignora */ }

  return null
}

// Salva a visualização do próprio usuário.
export async function saveOwnConfig(source: string, config: ColumnConfig) {
  try { localStorage.setItem(LS_KEY(source), JSON.stringify(config)) } catch { /* ignora */ }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  await supabase.from('view_settings').upsert(
    { user_id: session.user.id, source, columns: config, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,source' },
  )
}

// Salva como padrão global (somente ADM, garantido por RLS).
export async function saveGlobalConfig(source: string, config: ColumnConfig): Promise<string | null> {
  const { error } = await supabase.from('view_settings').upsert(
    { user_id: GLOBAL_ID, source, columns: config, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,source' },
  )
  return error?.message ?? null
}
