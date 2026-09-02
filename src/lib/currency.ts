// Formatação e parsing de valores monetários em BRL.

// Formata um número como moeda BRL: 1234.5 → "R$ 1.234,50"
export function formatBRL(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Formata sem o símbolo, só o número: 1234.5 → "1.234,50"
export function formatBRLNumber(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Converte o texto digitado (com máscara) em centavos → número decimal.
// Usa a heurística de "digitação por centavos": cada dígito empurra o valor.
// "" → null; "12345" → 123.45
export function digitsToNumber(digits: string): number | null {
  const only = digits.replace(/\D/g, '')
  if (!only) return null
  return parseInt(only, 10) / 100
}

// Aplica a máscara de moeda ao valor cru digitado (só dígitos → "1.234,56").
export function maskCurrencyInput(raw: string): string {
  const n = digitsToNumber(raw)
  if (n == null) return ''
  return formatBRLNumber(n)
}
