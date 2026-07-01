export type EventItem = {
  id: string
  name: string
  date: string | null
  location: string | null
  type: string | null
  theme: string | null
  created_at: string
}

export type EventRegistration = {
  id: string
  event_id: string
  name: string | null
  phone: string | null
  email: string | null
  specialty: string | null
  notes: string | null
  status: 'novo' | 'em_contato' | 'convertido' | 'perdido'
  created_at: string
}
