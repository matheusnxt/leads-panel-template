import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { formatPhoneBR } from '@/lib/phone'
import { enviarEventoMeta } from '@/lib/metaCapi'

// Recebe os cadastros da página de lives (publicada no Lovable) e grava em
// leads com source = 'lives', que é o que a aba "Lives" do painel lê.
//
// Diferente de /api/leads/site, que é aberta ao mundo, esta rota se protege:
//  - só aceita requisições vindas dos domínios da página (Origin);
//  - valida e limita o tamanho de cada campo;
//  - ignora robôs que preenchem o campo-armadilha (honeypot);
//  - não duplica o mesmo e-mail enviado de novo em 24 horas;
//  - usa a hora do servidor, nunca a do navegador.

const LIVES_SOURCE = 'lives'
const FORM_NAME = 'Lives Black November'
const PERGUNTA_TESTES = 'Já realiza testes respiratórios?'
const RESPOSTAS_TESTES: Record<string, string> = { sim: 'Sim, já realizo', nao: 'Ainda não' }
const LIMITE_CORPO = 10_000

// Domínios que podem enviar. Para acrescentar um, use LIVES_ALLOWED_ORIGINS
// (lista separada por vírgula) no ambiente da Vercel, sem mexer no código.
const ORIGENS_PADRAO = [
  'https://healthgoair.testesrespiratorios.com.br',
  'https://healthgoair.lovable.app',
]
// Prévias do projeto "[NXT] LP HealthGo" no Lovable.
const PREVIA_LOVABLE = /^https:\/\/(id-preview--)?82ee0449-4f03-46cb-b2c9-cb172507c960[\w.-]*\.lovable(app|project)\.(app|com)$/
const LOCAL = /^http:\/\/localhost:\d+$/

function origemPermitida(origem: string | null): boolean {
  if (!origem) return false
  const extras = (process.env.LIVES_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if ([...ORIGENS_PADRAO, ...extras].includes(origem)) return true
  if (PREVIA_LOVABLE.test(origem)) return true
  // localhost só fora de produção, para testar a página sem publicar.
  return process.env.NODE_ENV !== 'production' && LOCAL.test(origem)
}

function cors(origem: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origem && origemPermitida(origem) ? origem : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function OPTIONS(request: NextRequest) {
  const origem = request.headers.get('origin')
  return new Response(null, { status: origemPermitida(origem) ? 204 : 403, headers: cors(origem) })
}

const texto = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''

export async function POST(request: NextRequest) {
  const origem = request.headers.get('origin')
  const cabecalhos = cors(origem)
  const responder = (corpo: Record<string, unknown>, status = 200) =>
    Response.json(corpo, { status, headers: cabecalhos })

  if (!origemPermitida(origem)) return responder({ error: 'Origem não autorizada.' }, 403)

  const tamanho = Number(request.headers.get('content-length') ?? 0)
  if (tamanho > LIMITE_CORPO) return responder({ error: 'Requisição grande demais.' }, 413)

  let corpo: Record<string, unknown>
  try {
    corpo = await request.json()
  } catch {
    return responder({ error: 'JSON inválido.' }, 400)
  }

  // Honeypot: campo invisível que pessoas não preenchem. Responde "ok" para o
  // robô não perceber que foi barrado, mas não grava nada.
  if (texto(corpo.website ?? corpo.site, 200)) return responder({ ok: true })

  const nome = texto(corpo.nome, 120)
  const email = texto(corpo.email, 160).toLowerCase()
  const telefone = texto(corpo.telefone, 30)
  const realiza = texto(corpo.realizaTestes, 10)
  const digitos = telefone.replace(/\D/g, '')

  const erros: Record<string, string> = {}
  if (nome.length < 2) erros.nome = 'Informe seu nome.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) erros.email = 'Informe um e-mail válido.'
  if (digitos.length < 10 || digitos.length > 13) erros.telefone = 'Informe o telefone com DDD.'
  if (!(realiza in RESPOSTAS_TESTES)) erros.realizaTestes = 'Escolha uma opção.'
  if (Object.keys(erros).length) return responder({ error: 'Dados inválidos.', campos: erros }, 400)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Mesmo e-mail já cadastrado nas últimas 24h (ex.: formulário do topo e do
  // fim da página): conta como o mesmo cadastro, mas a pessoa vê "ok".
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: existente } = await supabase
    .from('leads')
    .select('id')
    .eq('source', LIVES_SOURCE)
    .eq('email', email)
    .gte('created_at', desde)
    .limit(1)
  if (existente?.length) return responder({ ok: true, duplicado: true })

  // Origem do anúncio, quando o link veio de uma campanha.
  const utm = (corpo.utm && typeof corpo.utm === 'object' ? corpo.utm : {}) as Record<string, unknown>
  const u = (k: string) => texto(utm[k], 200) || null

  const { error } = await supabase.from('leads').insert({
    name: nome,
    email,
    phone: formatPhoneBR(telefone),
    status: 'novo',
    form_name: FORM_NAME,
    source: LIVES_SOURCE,
    custom_questions: { [PERGUNTA_TESTES]: RESPOSTAS_TESTES[realiza] },
    utm_source: u('utm_source'),
    utm_medium: u('utm_medium'),
    utm_campaign: u('utm_campaign'),
    utm_content: u('utm_content'),
    utm_term: u('utm_term'),
    platform: u('utm_source'),
    campaign: u('utm_campaign'),
    adset: u('utm_medium'),
    ad_name: u('utm_content'),
    created_at: new Date().toISOString(),
  })

  if (error) {
    // Não devolve a mensagem do banco ao navegador; fica só no log do servidor.
    console.error('[leads/lives] falha ao gravar', error.message)
    return responder({ error: 'Não foi possível registrar agora. Tente novamente.' }, 500)
  }

  // API de Conversões do Meta: o mesmo "Lead" que o Pixel dispara no navegador,
  // com o mesmo event_id para o Meta contar uma vez só. Sem token, não faz nada.
  const eventId = texto(corpo.metaEventId, 80)
  if (eventId) {
    const [primeiroNome, ...resto] = nome.split(' ')
    await enviarEventoMeta({
      nome: 'Lead',
      eventId,
      url: texto(corpo.pagina, 500) || origem,
      email,
      telefone: digitos.length <= 11 ? `55${digitos}` : digitos,
      primeiroNome,
      sobrenome: resto.join(' ') || undefined,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent'),
      fbp: texto(corpo.fbp, 200) || null,
      fbc: texto(corpo.fbc, 300) || null,
      dados: { content_name: FORM_NAME },
    })
  }
  return responder({ ok: true })
}
