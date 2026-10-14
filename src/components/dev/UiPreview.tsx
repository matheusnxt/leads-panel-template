'use client'

import { useState } from 'react'
import { ViewProvider } from '@/contexts/ViewContext'
import type { Lead } from '@/lib/supabase'
import LeadListView from '@/components/leads/LeadListView'
import LeadKanbanView from '@/components/leads/LeadKanbanView'
import ScoreGauge from '@/components/leads/ScoreGauge'
import { scoreLead } from '@/lib/leadScore'
import styles from './UiPreview.module.css'

// -----------------------------------------------------------------------------
// Bancada de UI — só para desenvolvimento.
//
// Monta os componentes REAIS com dados fictícios, fora do SessionGate, para
// avaliar o visual sem passar pelo login (que é protegido por CAPTCHA e não
// deve ser contornado). Nenhum dado real é lido aqui.
// -----------------------------------------------------------------------------

const lead = (
  id: string,
  name: string,
  email: string,
  status: Lead['status'],
  created_at: string,
  cq: Record<string, string>,
  extra: Partial<Lead> = {},
): Lead => ({
  id, name, email,
  phone: '+55 (61) 9 0000-0000',
  status,
  form_name: '[Exemplo] Form Nativo',
  utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
  custom_questions: cq,
  created_at,
  platform: 'facebook',
  campaign: '[Exemplo] Leads - Forms Nativo',
  adset: '01 - Interesses [Médicos]',
  ad_name: 'Ad - Estáticos [Topo]',
  responsible: null,
  conversion_value: null,
  loss_reason: null,
  loss_reason_note: null,
  ...extra,
})

// Nomes e contatos inventados — nada vem do banco.
const LEADS: Lead[] = [
  lead('p1', 'Dra. Helena Vasconcelos', 'helena.vasc@exemplo.com.br', 'novo', '2026-10-02T09:14:00Z', {
    'Você é um:': 'Médico(a)', 'Especialidade': 'Gastroenterologia',
    'Investimento': 'Acima de R$ 100.000', 'Urgência': 'Imediatamente', 'Decisão': 'Sou o decisor final',
  }),
  lead('p2', 'Rodrigo Yamashita', 'r.yamashita@exemplo.com.br', 'em_contato', '2026-10-02T11:42:00Z', {
    'Você é um:': 'Médico(a)', 'Especialidade': 'Coloproctologia',
    'Investimento': 'R$ 45.000 a R$ 100.000', 'Urgência': 'Entre 3 e 6 meses', 'Decisão': 'Participo da decisão',
  }),
  lead('p3', 'Dra. Beatriz Montenegro', 'bmontenegro@exemplo.com.br', 'convertido', '2026-09-28T15:07:00Z', {
    'Você é um:': 'Médico(a)', 'Especialidade': 'Endocrinologia',
    'Investimento': 'Acima de R$ 100.000', 'Urgência': 'Imediatamente', 'Decisão': 'Sou o decisor final',
  }, { conversion_value: 87400, responsible: 'Camila' }),
  lead('p4', 'Iara Nogueira', 'iara.nog@exemplo.com.br', 'novo', '2026-10-03T08:20:00Z', {
    'Você é um:': 'Nutricionista', 'Investimento': 'Até R$ 37.000', 'Urgência': 'Só avaliando',
  }),
  lead('p5', 'Dr. Péricles Amorim', 'pamorim@exemplo.com.br', 'em_contato', '2026-10-01T17:35:00Z', {
    'Você é um:': 'Médico(a)', 'Especialidade': 'Clínica médica',
    'Investimento': 'R$ 37.000 a R$ 45.000', 'Urgência': 'Entre 6 e 12 meses', 'Decisão': 'Indico, mas não decido',
  }),
  lead('p6', 'Solange Ribeiro Tavares', 'solange.rt@exemplo.com.br', 'perdido', '2026-09-24T13:02:00Z', {
    'Você é um:': 'Gestor da área da saúde', 'Investimento': 'Até R$ 37.000', 'Urgência': 'Só avaliando',
  }, { loss_reason: 'Sem budget' }),
  lead('p7', 'Dr. Aurélio Khoury', 'akhoury@exemplo.com.br', 'novo', '2026-10-03T10:55:00Z', {
    'Você é um:': 'Médico(a)', 'Especialidade': 'Nutrologia',
    'Investimento': 'R$ 45.000 a R$ 100.000', 'Urgência': 'Entre 3 e 6 meses', 'Decisão': 'Sou o decisor final',
  }),
  lead('p8', 'Marcela Pinheiro Dutra', 'mpdutra@exemplo.com.br', 'novo', '2026-10-03T14:11:00Z', {
    'Você é um:': 'Médico(a)', 'Especialidade': 'Ginecologia / Obstetrícia',
    'Investimento': 'Até R$ 37.000', 'Urgência': 'Entre 6 e 12 meses', 'Decisão': 'Participo da decisão',
  }),
]

const SECOES = ['Score', 'Lista', 'Kanban'] as const
type Secao = (typeof SECOES)[number]

export default function UiPreview() {
  const [secao, setSecao] = useState<Secao>('Lista')
  const [leads, setLeads] = useState(LEADS)

  const mudarStatus = (id: string, status: Lead['status']) =>
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, status } : l)))

  return (
    <ViewProvider>
      <div className={styles.page}>
        <header className={styles.topo}>
          <div>
            <h1 className={styles.titulo}>Bancada de UI</h1>
            <p className={styles.sub}>
              Componentes reais com dados fictícios · somente em desenvolvimento
            </p>
          </div>
          <nav className={styles.abas}>
            {SECOES.map(s => (
              <button
                key={s}
                type="button"
                className={s === secao ? styles.abaAtiva : styles.aba}
                onClick={() => setSecao(s)}
              >
                {s}
              </button>
            ))}
          </nav>
        </header>

        {secao === 'Score' && (
          <section className={styles.bloco}>
            <h2 className={styles.h2}>ScoreGauge</h2>
            <div className={styles.gauges}>
              {leads.map(l => (
                <div key={l.id} className={styles.gaugeItem}>
                  <ScoreGauge result={scoreLead(l)} size={46} />
                  <span>{l.name.split(' ').slice(0, 2).join(' ')}</span>
                  <small>{scoreLead(l)?.score ?? '—'}</small>
                </div>
              ))}
            </div>
          </section>
        )}

        {secao === 'Lista' && (
          <section className={styles.bloco}>
            <h2 className={styles.h2}>LeadListView</h2>
            <LeadListView leads={leads} allLeads={leads} source="meta" isAdmin />
          </section>
        )}

        {secao === 'Kanban' && (
          <section className={styles.bloco}>
            <h2 className={styles.h2}>LeadKanbanView</h2>
            <LeadKanbanView
              leads={leads}
              allLeads={leads}
              onStatusChange={mudarStatus}
              onConvert={id => mudarStatus(id, 'convertido')}
              onLose={id => mudarStatus(id, 'perdido')}
            />
          </section>
        )}
      </div>
    </ViewProvider>
  )
}
