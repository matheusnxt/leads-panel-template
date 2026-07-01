import { NextRequest } from 'next/server'
import { getAdminClient, requireAdm, usernameToEmail, logAdminAction, type Role } from '@/lib/auth'
import { TAB_KEYS } from '@/lib/tabs'

// Lista todos os usuários (somente ADM)
export async function GET(request: NextRequest) {
  if (!(await requireAdm(request.headers.get('authorization')))) {
    return new Response('Forbidden', { status: 403 })
  }
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, username, name, role, permissions, created_at')
    .order('created_at', { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ users: data })
}

// Cria um usuário (somente ADM)
export async function POST(request: NextRequest) {
  const caller = await requireAdm(request.headers.get('authorization'))
  if (!caller) {
    return new Response('Forbidden', { status: 403 })
  }

  const body = await request.json()
  const username = String(body.username ?? '').trim().toLowerCase()
  const name = String(body.name ?? '').trim()
  const password = String(body.password ?? '')
  const role: Role = body.role === 'adm' ? 'adm' : 'usuario'
  const permissions: string[] = Array.isArray(body.permissions)
    ? body.permissions.filter((p: string) => (TAB_KEYS as string[]).includes(p))
    : [...TAB_KEYS]

  if (!username || !password) {
    return Response.json({ error: 'Usuário e senha são obrigatórios.' }, { status: 400 })
  }
  if (password.length < 6) {
    return Response.json({ error: 'A senha precisa ter ao menos 6 caracteres.' }, { status: 400 })
  }

  const admin = getAdminClient()

  // cria no Auth já confirmado (sem e-mail de verificação)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  })
  if (createErr || !created.user) {
    const msg = /already|registered|exists/i.test(createErr?.message ?? '')
      ? 'Esse usuário já existe.'
      : (createErr?.message ?? 'Erro ao criar usuário.')
    return Response.json({ error: msg }, { status: 400 })
  }

  const { error: profErr } = await admin.from('profiles').insert({
    id: created.user.id,
    username,
    name: name || username,
    role,
    permissions,
  })
  if (profErr) {
    // desfaz o usuário do Auth se o perfil falhar
    await admin.auth.admin.deleteUser(created.user.id)
    const msg = /duplicate|unique/i.test(profErr.message)
      ? 'Esse usuário já existe.'
      : profErr.message
    return Response.json({ error: msg }, { status: 400 })
  }

  await logAdminAction(caller.id, `criou o usuário "${name || username}" (${role === 'adm' ? 'Administrador' : 'Usuário'})`)
  return Response.json({ ok: true })
}
