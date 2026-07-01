import type { Lead } from './supabase'

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Pega a resposta cujo nome de campo (normalizado) casa com o predicado
function answer(cq: Record<string, string> | null, test: (k: string) => boolean): string | null {
  if (!cq) return null
  for (const [k, v] of Object.entries(cq)) {
    if (test(norm(k)) && v && String(v).trim()) return norm(String(v))
  }
  return null
}

export type ScoreResult = { score: number; band: 'red' | 'yellow' | 'green'; star: boolean } | null

// Score de qualidade 0–100 a partir das respostas do formulário.
// Retorna null quando o lead não tem nenhum critério respondido.
export function scoreLead(lead: Lead): ScoreResult {
  const cq = lead.custom_questions
  const role = answer(cq, k => k.includes('voce e') || k === 'medico' || k.includes('profissional'))
  const esp1 = answer(cq, k => k === 'especialidade' || k.startsWith('especialidade -') || k.startsWith('especialidade ('))
  const esp2 = answer(cq, k => k.includes('especialidade') && (k.includes('02') || k.includes('#2')))
  const invest = answer(cq, k => k.includes('investimento'))
  const urg = answer(cq, k => k.includes('urgencia'))
  const dec = answer(cq, k => k.includes('decisao'))

  if (!role && !esp1 && !esp2 && !invest && !urg && !dec) return null

  let s = 0

  // Médico / Gestor (20)
  if (role) {
    if (role.includes('medic')) s += 20
    else if (role.includes('nutri')) s += 8
    else if (role.includes('gestor')) s += 6
  }

  // Especialidade (25) — gastro é o padrão ouro
  if (esp1) {
    s += esp1.includes('gastro') ? 25 : 18
  } else if (esp2) {
    s += 12
  }

  // Investimento (25) — quanto maior, melhor (faixa 30–50k já é desejada)
  if (invest) {
    if (invest.includes('acima')) s += 25          // Acima de R$ 100.000
    else if (invest.includes('100')) s += 22        // R$50.000 a R$ 100.000
    else if (invest.includes('50')) s += 18         // R$30.000 a R$ 50.000 (faixa desejada)
    else if (invest.includes('ate')) s += 8         // Até R$ 30.000
  }

  // Urgência (20) — quanto mais urgente, melhor
  if (urg) {
    if (urg.includes('imediat')) s += 20
    else if (urg.includes('3 e 6')) s += 13
    else if (urg.includes('6 e 12')) s += 7
    else if (urg.includes('avaliando')) s += 3
  }

  // Decisão (10) — decisores valem mais
  if (dec) {
    if (dec.includes('decisor final')) s += 10
    else if (dec.includes('participo')) s += 7
    else if (dec.includes('indico')) s += 3
  }

  const score = Math.min(100, Math.round(s))
  const band = score < 40 ? 'red' : score < 70 ? 'yellow' : 'green'
  return { score, band, star: score >= 90 }
}

// Cor contínua vermelho → amarelo → verde conforme o score
export function scoreColor(score: number): string {
  const hue = Math.max(0, Math.min(120, score * 1.2)) // 0=vermelho, 60=amarelo, 120=verde
  return `hsl(${hue}, 75%, 45%)`
}

export const BAND_LABEL: Record<'red' | 'yellow' | 'green', string> = {
  red: 'Frio', yellow: 'Morno', green: 'Quente',
}
