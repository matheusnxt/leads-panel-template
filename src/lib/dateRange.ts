export type DateRangeKey =
  | 'all' | 'today' | 'yesterday' | 'last3' | 'last7'
  | 'last14' | 'month' | 'lastmonth' | 'last3months' | 'custom'

export const DATE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: 'all',         label: 'Todo o período' },
  { key: 'today',       label: 'Hoje' },
  { key: 'yesterday',   label: 'Ontem' },
  { key: 'last3',       label: 'Últimos 3 dias' },
  { key: 'last7',       label: 'Últimos 7 dias' },
  { key: 'last14',      label: 'Últimos 14 dias' },
  { key: 'month',       label: 'Esse mês' },
  { key: 'lastmonth',   label: 'Mês passado' },
  { key: 'last3months', label: 'Últimos 3 meses' },
  { key: 'custom',      label: 'Personalizado' },
]

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

// Retorna o intervalo [from, to) para a opção. null = sem limite.
export function getRange(
  key: DateRangeKey,
  custom?: { from?: string; to?: string },
): { from: Date | null; to: Date | null } {
  const now = new Date()
  const today = startOfDay(now)

  switch (key) {
    case 'today':
      return { from: today, to: null }
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      return { from: y, to: today }
    }
    case 'last3': {
      const f = new Date(today); f.setDate(f.getDate() - 2)
      return { from: f, to: null }
    }
    case 'last7': {
      const f = new Date(today); f.setDate(f.getDate() - 6)
      return { from: f, to: null }
    }
    case 'last14': {
      const f = new Date(today); f.setDate(f.getDate() - 13)
      return { from: f, to: null }
    }
    case 'month': {
      const f = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: f, to: null }
    }
    case 'lastmonth': {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const t = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: f, to: t }
    }
    case 'last3months': {
      const f = new Date(today); f.setMonth(f.getMonth() - 3)
      return { from: f, to: null }
    }
    case 'custom': {
      const from = custom?.from ? startOfDay(new Date(custom.from + 'T00:00:00')) : null
      let to: Date | null = null
      if (custom?.to) {
        to = new Date(custom.to + 'T00:00:00')
        to.setDate(to.getDate() + 1) // inclui o dia final inteiro
      }
      return { from, to }
    }
    case 'all':
    default:
      return { from: null, to: null }
  }
}

export function inRange(dateIso: string, range: { from: Date | null; to: Date | null }): boolean {
  const t = new Date(dateIso).getTime()
  if (range.from && t < range.from.getTime()) return false
  if (range.to && t >= range.to.getTime()) return false
  return true
}
