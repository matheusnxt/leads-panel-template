import { NextRequest } from 'next/server'
import { fetchFunnel, rangeFromParams } from '@/lib/hubspot'

export const maxDuration = 60

// Funil HubSpot (Leads/MQL/SQL/Vendas/Faturamento) × Total/Tráfego/Orgânico.
export async function GET(request: NextRequest) {
  try {
    const data = await fetchFunnel(rangeFromParams(request.nextUrl.searchParams))
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
