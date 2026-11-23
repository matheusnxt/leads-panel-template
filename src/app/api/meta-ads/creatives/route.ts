import { NextRequest } from 'next/server'
import { requireAdm } from '@/lib/auth'
import { fetchCreatives, rangeFromParams } from '@/lib/metaAds'

export const maxDuration = 60

// Tabela de criativos (nível ad) com capa/thumbnail.
export async function GET(request: NextRequest) {
  // Dados de anúncios e funil: só administradores logados (o token vem no cabeçalho).
  if (!(await requireAdm(request.headers.get('authorization')))) {
    return Response.json({ error: 'Sessão expirada ou sem permissão. Entre novamente.' }, { status: 401 })
  }
  try {
    const rows = await fetchCreatives(rangeFromParams(request.nextUrl.searchParams))
    return Response.json({ rows })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
