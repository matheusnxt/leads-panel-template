import type { Role } from './auth'

export type TabKey = 'leads' | 'site' | 'planilhas' | 'upload' | 'eventos'

// Abas cujo acesso o admin pode liberar por usuário.
export const TABS: { key: TabKey; path: string; label: string }[] = [
  { key: 'leads',     path: '/',             label: 'Leads' },
  { key: 'site',      path: '/leads-site',   label: 'Leads Site' },
  { key: 'planilhas', path: '/planilhas',    label: 'Leads Planilhas' },
  { key: 'upload',    path: '/leads-upload', label: 'Leads - Upload' },
  { key: 'eventos',   path: '/eventos',      label: 'Eventos' },
]

// Chaves de permissão válidas (allowlist usada também na API).
export const TAB_KEYS: TabKey[] = TABS.map(t => t.key)

// Caminhos que um usuário pode acessar, considerando papel e permissões.
export function allowedPaths(role: Role, permissions: string[] | null): string[] {
  if (role === 'adm') return ['/', '/leads-site', '/planilhas', '/leads-upload', '/eventos', '/ads', '/funil', '/usuarios', '/atividades']
  const perms = permissions ?? []
  return TABS.filter(t => perms.includes(t.key)).map(t => t.path)
}

export function canAccess(role: Role, permissions: string[] | null, pathname: string): boolean {
  return allowedPaths(role, permissions).includes(pathname)
}
