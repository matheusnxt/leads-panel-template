import LeadsPage from '@/components/leads/LeadsPage'

// Aba "Lives": idêntica à aba Leads (lista, kanban, filtros, score, exportação,
// tempo real e Analytics), mas só mostra leads com source = 'lives'.
export default function LivesPage() {
  return <LeadsPage source="lives" />
}
