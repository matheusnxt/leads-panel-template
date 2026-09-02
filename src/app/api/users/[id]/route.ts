import { NextRequest } from 'next/server'
import { getAdminClient, requireAdm, logAdminAction, passwordError, type Role } from '@/lib/auth'
import { TAB_KEYS } from '@/lib/tabs'

// Edita um usuário: nome, papel, permissões e (opcionalmente) senha. Somente ADM.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/users/[id]'>) {
  const caller = await requireAdm(request.headers.get('authorization'))
  if (!caller) {
    return new Response('Forbidden', { status: 403 })
  }

  const { id } = await ctx.params
  const body = await request.json()
  const admin = getAdminClient()

  // atualiza o perfil
  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string') update.name = body.name.trim()
  if (body.role === 'adm' || body.role === 'usuario') update.role = body.role as Role
  if (Array.isArray(body.permissions)) {
    update.permissions = body.permissions.filter((p: string) => (TAB_KEYS as string[]).includes(p))
  }
  if (Object.keys(update).length > 0) {
    const { error } = await admin.from('profiles').update(update).eq('id', id)
    if (error) return Response.json({ error: error.message }, { status: 400 })
  }

  // troca de senha (opcional)
  if (body.password) {
    const pwErr = passwordError(String(body.password))
    if (pwErr) {
      return Response.json({ error: pwErr }, { status: 400 })
    }
    const { error } = await admin.auth.admin.updateUserById(id, { password: String(body.password) })
    if (error) return Response.json({ error: error.message }, { status: 400 })
  }

  const { data: edited } = await admin.from('profiles').select('name, username').eq('id', id).single()
  await logAdminAction(caller.id, `editou o usuário "${edited?.name || edited?.username || id}"`)
  return Response.json({ ok: true })
}

// Exclui um usuário (somente ADM)
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/users/[id]'>) {
  const caller = await requireAdm(request.headers.get('authorization'))
  if (!caller) return new Response('Forbidden', { status: 403 })

  const { id } = await ctx.params
  if (id === caller.id) {
    return Response.json({ error: 'Você não pode excluir o próprio usuário.' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data: target } = await admin.from('profiles').select('name, username').eq('id', id).single()
  const { error } = await admin.auth.admin.deleteUser(id) // o perfil cai por ON DELETE CASCADE
  if (error) return Response.json({ error: error.message }, { status: 500 })
  await logAdminAction(caller.id, `excluiu o usuário "${target?.name || target?.username || id}"`)
  return Response.json({ ok: true })
}
