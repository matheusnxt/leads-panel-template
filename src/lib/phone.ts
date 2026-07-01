// Formatação de telefones no padrão internacional com foco no Brasil.
// Brasil:        +55 (DD) 9 XXXX-XXXX  (celular)  /  +55 (DD) XXXX-XXXX (fixo)
// Outros países: +<código do país> <número>  (ex.: EUA +1, Portugal +351)
//
// Se não for possível identificar um número válido, devolve o valor original
// (limpo) — nunca devolve notação científica.

// Códigos de discagem (DDI) conhecidos, para detectar o país de números
// internacionais. Lista enxuta mas abrangente; o casamento é pelo prefixo
// mais longo. Brasil (55) é tratado à parte com formatação dedicada.
const CALLING_CODES = new Set([
  '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41',
  '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56',
  '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86',
  '90', '91', '92', '93', '94', '95', '98', '212', '213', '216', '218', '220',
  '221', '234', '244', '249', '251', '254', '255', '256', '258', '260', '263',
  '297', '298', '299', '350', '351', '352', '353', '354', '355', '356', '357',
  '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378',
  '380', '381', '382', '383', '385', '386', '387', '389', '420', '421', '423',
  '500', '501', '502', '503', '504', '505', '506', '507', '509', '590', '591',
  '592', '593', '594', '595', '596', '597', '598', '599', '670', '672', '673',
  '675', '676', '677', '679', '680', '852', '853', '855', '856', '880', '886',
  '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971',
  '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996',
  '998',
])

// Formata o número nacional brasileiro (sem DDI). Retorna null se não tiver
// 10 (fixo) ou 11 (celular) dígitos após remover zeros de tronco.
function formatBRNational(national: string): string | null {
  const n = national.replace(/\D/g, '').replace(/^0+/, '')
  if (n.length === 11) return `+55 (${n.slice(0, 2)}) ${n[2]} ${n.slice(3, 7)}-${n.slice(7)}`
  if (n.length === 10) return `+55 (${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return null
}

// Formata um número internacional (não-BR) como +<DDI> <número agrupado>.
function formatInternational(digits: string): string {
  for (const len of [3, 2, 1]) {
    const cc = digits.slice(0, len)
    if (CALLING_CODES.has(cc) && cc !== '55') {
      const rest = digits.slice(len)
      return `+${cc} ${rest}`.trim()
    }
  }
  return '+' + digits
}

// Detecta um número com notação científica (corrompido na importação de planilha,
// ex.: "5.52499E+12") — não dá para confiar no valor.
function isScientific(s: string): boolean {
  return /\d[eE][+-]?\d/.test(s)
}

export function formatPhone(raw: string | null | undefined): string {
  const original = String(raw ?? '').trim()
  if (!original) return ''
  if (isScientific(original)) return original // valor corrompido — não inventa número

  const hasIntlPrefix = /^\s*(\+|00)/.test(original)
  let digits = original.replace(/\D/g, '')
  if (!digits) return original
  if (digits.startsWith('00')) digits = digits.slice(2)

  // Brasil com DDI 55 (12 ou 13 dígitos: 55 + nacional de 10/11)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const br = formatBRNational(digits.slice(2))
    if (br) return br
  }

  // Sem prefixo internacional: assume Brasil (nacional, com possível 0 de tronco)
  if (!hasIntlPrefix) {
    const br = formatBRNational(digits)
    if (br) return br
  }

  // Internacional explícito de outro país
  if (hasIntlPrefix && !digits.startsWith('55')) {
    return formatInternational(digits)
  }

  // 55 com tamanho fora do padrão — tenta melhor esforço como BR
  if (digits.startsWith('55')) {
    const br = formatBRNational(digits.slice(2))
    if (br) return br
  }

  // Não reconhecido: devolve o original (limpo), nunca notação científica
  return hasIntlPrefix ? formatInternational(digits) : original
}

// Compatibilidade com chamadas existentes.
export const formatPhoneBR = formatPhone
