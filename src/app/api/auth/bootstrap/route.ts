import { NextRequest } from 'next/server'
import { getAdminClient, usernameToEmail } from '@/lib/auth'

// Cria o PRIMEIRO administrador. Só funciona se ainda não houver nenhum perfil.
// Protegido pelo mesmo token do webhook.
// Uso: POST /api/auth/bootstrap?token=...  body: { username, name, password }
export async function POST(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== process.env.WEBHOOK_VERIFY_TOKEN) {
    return new Response('Forbidden', { status: 403 })
  }

  const admin = getAdminClient()

  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
  if ((count ?? 0) > 0) {
    return Response.json({ error: 'Já existe pelo menos um usuário. Bootstrap desabilitado.' }, { status: 400 })
  }

  const body = await request.json()
  const username = String(body.username ?? '').trim().toLowerCase()
  const name = String(body.name ?? '').trim()
  const password = String(body.password ?? '')
  if (!username || password.length < 6) {
    return Response.json({ error: 'username e password (mín. 6) obrigatórios.' }, { status: 400 })
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  })
  if (error || !created.user) {
    return Response.json({ error: error?.message ?? 'Erro ao criar.' }, { status: 400 })
  }

  await admin.from('profiles').insert({
    id: created.user.id,
    username,
    name: name || username,
    role: 'adm',
  })

  return Response.json({ ok: true, username })
}
