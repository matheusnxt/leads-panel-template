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
// Cobre tanto os formulários do Meta quanto o formulário do site (HubSpot):
// as chaves de custom_questions são normalizadas e casam por substring.
// Retorna null quando o lead não tem nenhum critério respondido.
export function scoreLead(lead: Lead): ScoreResult {
  const cq = lead.custom_questions
  const role = answer(cq, k => k.includes('voce e') || k === 'medico' || k.includes('profissional'))
  const esp1 = answer(cq, k => k === 'especialidade' || k.startsWith('especialidade -') || k.startsWith('especialidade (') || k.includes('especialidade medica'))
  const esp2 = answer(cq, k => k.includes('especialidade') && (k.includes('02') || k.includes('#2')))
  const invest = answer(cq, k => k.includes('investimento'))
  const urg = answer(cq, k => k.includes('urgencia'))
  const dec = answer(cq, k => k.includes('decisao') || k.includes('perfil decisor'))

  // Sinais de lead PACIENTE (consumidor final) — vindos do form do site.
  const sintomas = answer(cq, k => k.includes('sintoma'))
  const pacInvest = answer(cq, k => k.includes('investigacao'))

  const hasProfile = Boolean(role || esp1 || esp2 || invest || urg || dec)
  if (!hasProfile && !sintomas && !pacInvest) return null

  let s = 0

  if (hasProfile) {
    // ===== Lead de médico/gestor (funil B2B) =====
    // Médico / Gestor (20)
    if (role) {
      if (role.includes('medic')) s += 20
      else if (role.includes('nutri')) s += 8
      else if (role.includes('gestor')) s += 6
    }
    // Especialidade (25) — gastro é o padrão ouro
    if (esp1) {
      s += esp1.includes('gastro') || esp1.includes('coloproc') ? 25 : 18
    } else if (esp2) {
      s += 12
    }
    // Investimento (25) — quanto maior, melhor.
    // Form atual: Até 37k / 37–45k / 45–100k / Acima de 100k.
    // Faixas antigas (30k/50k) mantidas para leads históricos.
    if (invest) {
      if (invest.includes('acima')) s += 25           // Acima de R$ 100.000
      else if (invest.includes('100')) s += 22         // R$45.000 a R$ 100.000 (e antiga 50–100k)
      else if (invest.includes('45')) s += 15          // R$37.000 a R$ 45.000
      else if (invest.includes('50')) s += 18          // faixa antiga até R$ 50.000
      else if (invest.includes('ate') || invest.includes('37') || invest.includes('30') || invest.includes('20')) s += 8 // Até R$ 37.000 (e faixas baixas antigas)
    }
    // Urgência (20) — quanto mais urgente, melhor
    if (urg) {
      if (urg.includes('imediat')) s += 20
      else if (urg.includes('3 e 6') || urg.includes('3 meses')) s += 13
      else if (urg.includes('6 e 12')) s += 7
      else if (urg.includes('avaliando')) s += 3
    }
    // Decisão (10) — decisores valem mais
    if (dec) {
      if (dec.includes('decisor final')) s += 10
      else if (dec.includes('participo')) s += 7
      else if (dec.includes('indico')) s += 3
    }
  } else {
    // ===== Lead de paciente (consumidor) — baixo valor p/ o funil B2B =====
    s = 8
    if (pacInvest) {
      if (pacInvest.includes('sem respostas')) s += 14   // frustrado, alta intenção
      else if (pacInvest.includes('diagnostico')) s += 6
      else s += 4                                        // começando a investigar
    }
    if (sintomas && !sintomas.includes('outros')) s += 3
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
