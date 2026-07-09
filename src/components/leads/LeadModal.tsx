'use client'

import { useEffect } from 'react'
import { X, Mail, Phone, Tag, Calendar, BarChart2, ListChecks, Repeat, Megaphone, History, ChevronRight } from 'lucide-react'
import type { Lead } from '@/lib/supabase'
import type { Submission, PriorCapture } from '@/lib/dedupe'
import { scoreLead } from '@/lib/leadScore'
import ScoreGauge from './ScoreGauge'
import ResponsibleSelect from './ResponsibleSelect'
import styles from './LeadModal.module.css'

const STATUS_LABELS: Record<Lead['status'], string> = {
  novo: 'Novo',
  em_contato: 'Em Contato',
  convertido: 'Convertido',
  perdido: 'Perdido',
}

type Props = {
  lead: Lead & { conversions?: number; submissions?: Submission[]; priorCaptures?: PriorCapture[] }
  onClose: () => void
  onOpenLead?: (id: string) => void
}

export default function LeadModal({ lead, onClose, onOpenLead }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const utms = [
    { label: 'utm_source',   value: lead.utm_source },
    { label: 'utm_medium',   value: lead.utm_medium },
    { label: 'utm_campaign', value: lead.utm_campaign },
    { label: 'utm_content',  value: lead.utm_content },
    { label: 'utm_term',     value: lead.utm_term },
  ].filter(u => u.value)

  const customAnswers = Object.entries(lead.custom_questions ?? {})
    .filter(([, v]) => v != null && String(v).trim() !== '')

  const submissions = lead.submissions ?? []
  const conversions = lead.conversions ?? 1
  const priorCaptures = lead.priorCaptures ?? []

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.header}>
          <ScoreGauge result={scoreLead(lead)} size={48} />
          <div className={styles.headerMain}>
            <h2 className={styles.name}>{lead.name}</h2>
            <div className={styles.headerBadges}>
              <span className={`${styles.status} ${styles[lead.status]}`}>
                {STATUS_LABELS[lead.status]}
              </span>
              {conversions > 1 && (
                <span className={styles.convPill}><Repeat size={11} /> {conversions} conversões</span>
              )}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Informações de contato</h3>
            <div className={styles.fields}>
              {lead.email && (
                <div className={styles.field}>
                  <Mail size={14} className={styles.fieldIcon} />
                  <div>
                    <div className={styles.fieldLabel}>E-mail</div>
                    <div className={styles.fieldValue}>{lead.email}</div>
                  </div>
                </div>
              )}
              {lead.phone && (
                <div className={styles.field}>
                  <Phone size={14} className={styles.fieldIcon} />
                  <div>
                    <div className={styles.fieldLabel}>Telefone</div>
                    <div className={styles.fieldValue}>{lead.phone}</div>
                  </div>
                </div>
              )}
              {lead.form_name && (
                <div className={styles.field}>
                  <Tag size={14} className={styles.fieldIcon} />
                  <div>
                    <div className={styles.fieldLabel}>Formulário</div>
                    <div className={styles.fieldValue}>{lead.form_name}</div>
                  </div>
                </div>
              )}
              <div className={styles.field}>
                <Calendar size={14} className={styles.fieldIcon} />
                <div>
                  <div className={styles.fieldLabel}>Capturado em</div>
                  <div className={styles.fieldValue}>
                    {new Date(lead.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Responsável pelo atendimento</h3>
            <ResponsibleSelect leadId={lead.id} leadName={lead.name || 'lead'} value={lead.responsible} />
          </section>

          {customAnswers.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>
                <ListChecks size={13} />
                Respostas do formulário
              </h3>
              <div className={styles.answers}>
                {customAnswers.map(([question, answer]) => (
                  <div key={question} className={styles.answer}>
                    <div className={styles.answerQuestion}>{question}</div>
                    <div className={styles.answerValue}>{answer}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {submissions.length > 1 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>
                <Repeat size={13} />
                Histórico de conversões ({submissions.length})
              </h3>
              <div className={styles.history}>
                {submissions.map((s, i) => (
                  <div key={i} className={styles.historyItem}>
                    <div className={styles.historyForm}>{s.form_name || 'Sem formulário'}</div>
                    <div className={styles.historyDate}>
                      {new Date(s.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {utms.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>
                <BarChart2 size={13} />
                Rastreamento UTM
              </h3>
              <div className={styles.utmGrid}>
                {utms.map(u => (
                  <div key={u.label} className={styles.utmItem}>
                    <div className={styles.utmLabel}>{u.label}</div>
                    <div className={styles.utmValue}>{u.value}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(lead.platform || lead.campaign || lead.adset || lead.ad_name) && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>
                <Megaphone size={13} />
                Origem do anúncio (UTM)
              </h3>
              <div className={styles.fields}>
                {lead.platform && (
                  <div className={styles.field}><div><div className={styles.fieldLabel}>Plataforma</div><div className={styles.fieldValue}>{lead.platform}</div></div></div>
                )}
                {lead.campaign && (
                  <div className={styles.field}><div><div className={styles.fieldLabel}>Campanha</div><div className={styles.fieldValue}>{lead.campaign}</div></div></div>
                )}
                {lead.adset && (
                  <div className={styles.field}><div><div className={styles.fieldLabel}>Conjunto</div><div className={styles.fieldValue}>{lead.adset}</div></div></div>
                )}
                {lead.ad_name && (
                  <div className={styles.field}><div><div className={styles.fieldLabel}>Anúncio</div><div className={styles.fieldValue}>{lead.ad_name}</div></div></div>
                )}
              </div>
            </section>
          )}

          {priorCaptures.length > 0 && (
            <section className={styles.priorNotice}>
              <div className={styles.priorTitle}>
                <History size={14} />
                Lead já capturado anteriormente em:
              </div>
              <div className={styles.priorList}>
                {priorCaptures.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={styles.priorItem}
                    onClick={() => onOpenLead?.(p.id)}
                    disabled={!onOpenLead}
                    title="Abrir o card anterior"
                  >
                    <span className={styles.priorItemMain}>
                      <span className={styles.priorDate}>
                        {new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                      <span className={styles.priorForms}>
                        {(p.forms.length ? p.forms.join(', ') : 'Sem formulário')}
                        {p.conversions > 1 && ` · ${p.conversions} conversões`}
                      </span>
                    </span>
                    <ChevronRight size={15} className={styles.priorChevron} />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
