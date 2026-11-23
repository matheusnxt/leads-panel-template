import { NextRequest } from 'next/server'
import { requireAdm } from '@/lib/auth'
import { fetchTable, rangeFromParams } from '@/lib/metaAds'

export const maxDuration = 60

// Tabela de campanhas (?level=campaign) ou conjuntos (?level=adset).
export async function GET(request: NextRequest) {
  // Dados de anúncios e funil: só administradores logados (o token vem no cabeçalho).
  if (!(await requireAdm(request.headers.get('authorization')))) {
    return Response.json({ error: 'Sessão expirada ou sem permissão. Entre novamente.' }, { status: 401 })
  }
  const level = request.nextUrl.searchParams.get('level') === 'adset' ? 'adset' : 'campaign'
  try {
    const rows = await fetchTable(level, rangeFromParams(request.nextUrl.searchParams))
    return Response.json({ rows })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
