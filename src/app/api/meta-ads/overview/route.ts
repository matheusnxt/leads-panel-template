import { NextRequest } from 'next/server'
import { fetchOverview, rangeFromParams } from '@/lib/metaAds'

export const maxDuration = 60

// Métricas da conta + série diária + funil, no período selecionado.
export async function GET(request: NextRequest) {
  try {
    const data = await fetchOverview(rangeFromParams(request.nextUrl.searchParams))
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
