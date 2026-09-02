import { NextRequest } from 'next/server'
import { fetchTable, rangeFromParams } from '@/lib/metaAds'

export const maxDuration = 60

// Tabela de campanhas (?level=campaign) ou conjuntos (?level=adset).
export async function GET(request: NextRequest) {
  const level = request.nextUrl.searchParams.get('level') === 'adset' ? 'adset' : 'campaign'
  try {
    const rows = await fetchTable(level, rangeFromParams(request.nextUrl.searchParams))
    return Response.json({ rows })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
