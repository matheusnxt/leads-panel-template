import { NextRequest } from 'next/server'
import { fetchCreatives, rangeFromParams } from '@/lib/metaAds'

export const maxDuration = 60

// Tabela de criativos (nível ad) com capa/thumbnail.
export async function GET(request: NextRequest) {
  try {
    const rows = await fetchCreatives(rangeFromParams(request.nextUrl.searchParams))
    return Response.json({ rows })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
