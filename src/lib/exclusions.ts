// ---------------------------------------------------------------------------
// Leads que não devem aparecer no painel.
//
// Os formulários de curso captam público de outro produto (inscrição em curso,
// não intenção de compra do equipamento) e distorcem o funil comercial.
// Nada é apagado no HubSpot nem no banco: este filtro apenas esconde.
// ---------------------------------------------------------------------------

// Aba Leads / Analytics / Meta Ads — o banco grava o nome do formulário.
export const FORMULARIOS_EXCLUIDOS = [
  'Formulário Curso Health GO 08/09 - v2',
  'Formulário Curso Health GO 08/09',
]

// Funil (HubSpot) — o objeto `leads` não guarda o formulário de origem, só a
// campanha do Meta que trouxe o contato. Os leads desses formulários vieram da
// campanha "[nxt] leads - forms nativo [curso presencial sp] [set/26]", então o
// corte é feito por este termo no nome da campanha.
export const CAMPANHAS_EXCLUIDAS_TOKEN = 'curso'

// Filtro para consultas PostgREST (Supabase): `form_name` fora da lista.
// Usa not/in com os nomes entre aspas, formato exigido pelo PostgREST.
export function filtroFormulariosExcluidos(): { coluna: string; valores: string } {
  return {
    coluna: 'form_name',
    valores: `(${FORMULARIOS_EXCLUIDOS.map(f => `"${f}"`).join(',')})`,
  }
}
