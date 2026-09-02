import { NextRequest } from 'next/server'
import { fetchCreativeMedia } from '@/lib/metaAds'

export const maxDuration = 30

// Resolve a mídia completa de um anúncio para o modal (vídeo ou imagem).
export async function GET(request: NextRequest) {
  const adId = request.nextUrl.searchParams.get('adId')
  if (!adId) return Response.json({ error: 'adId obrigatório' }, { status: 400 })
  try {
    const media = await fetchCreativeMedia(adId)
    return Response.json(media)
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
