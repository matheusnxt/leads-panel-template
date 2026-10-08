'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, TriangleAlert, Users, Filter, Target, Trophy, DollarSign } from 'lucide-react'
import type { Funnel, StageRow } from '@/lib/hubspot'
import { type DateRangeKey } from '@/lib/dateRange'
import { formatBRL } from '@/lib/currency'
import DateRangeDropdown from '@/components/leads/DateRangeDropdown'
import styles from './FunnelView.module.css'

const LS_RANGE = 'app-funil-range'
const int = (n: number) => Math.round(n || 0).toLocaleString('pt-BR')
const pct = (n: number) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

// Funil trapezoidal (mesmo estilo da aba Meta Ads).
const FUNNEL_INSETS = [0, 8, 17, 26, 34]
const FUNNEL_FILLS = [
  'linear-gradient(180deg,#4f46e5,#4338ca)',
  'linear-gradient(180deg,#6366f1,#4f46e5)',
  'linear-gradient(180deg,#a5b4fc,#818cf8)',
  'linear-gradient(180deg,#10b981,#047857)',
]
const FUNNEL_DARKTEXT = [false, false, true, false]

export default function FunnelView() {
  const [dateKey, setDateKey] = useState<DateRangeKey>('month')
  const [custom, setCustom] = useState({ from: '', to: '' })

  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const s = localStorage.getItem(LS_RANGE)
      if (s) { const p = JSON.parse(s); if (p.dateKey) setDateKey(p.dateKey); if (p.custom) setCustom(p.custom) }
    } catch { /* ignora */ }
  }, [])
  const persist = (k: DateRangeKey, c: { from: string; to: string }) => {
    try { localStorage.setItem(LS_RANGE, JSON.stringify({ dateKey: k, custom: c })) } catch { /* ignora */ }
  }
  const onDateKey = (k: DateRangeKey) => { setDateKey(k); persist(k, custom) }
  const onCustom = (c: { from: string; to: string }) => { setCustom(c); persist(dateKey, c) }

  const ready = dateKey !== 'custom' || (Boolean(custom.from) && Boolean(custom.to))
  const qs = useMemo(() => {
    const p = new URLSearchParams({ dateKey })
    if (dateKey === 'custom') { p.set('from', custom.from); p.set('to', custom.to) }
    return p.toString()
  }, [dateKey, custom])

  useEffect(() => {
    if (!ready) return
    let cancel = false
    setLoading(true); setErr(null); setFunnel(null)

    fetch(`/api/hubspot/funnel?${qs}`)
      .then(async r => {
        const j = await r.json()
        if (!r.ok || j.error) throw new Error(j.error ?? `Erro ${r.status}`)
        return j as Funnel
      })
      .then(f => { if (!cancel) setFunnel(f) })
      .catch(e => { if (!cancel) setErr(e.message) })
      .finally(() => { if (!cancel) setLoading(false) })

    return () => { cancel = true }
  }, [qs, ready])

  const stage = (k: string): StageRow | undefined => funnel?.stages.find(s => s.key === k)
  const leadsError = funnel?.leadsError ?? null

  const ROWS: { key: string; label: string; icon: React.ComponentType<{ size?: number }>; money?: boolean; get: () => StageRow | undefined }[] = [
    { key: 'leads', label: 'Leads', icon: Users, get: () => stage('leads') },
    { key: 'mql', label: 'MQL', icon: Filter, get: () => stage('mql') },
    { key: 'sql', label: 'SQL', icon: Target, get: () => stage('sql') },
    { key: 'vendas', label: 'Vendas', icon: Trophy, get: () => funnel?.sales },
    { key: 'faturamento', label: 'Faturamento', icon: DollarSign, money: true, get: () => funnel ? { key: 'faturamento', label: 'Faturamento', ...funnel.revenue } : undefined },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h1 className={styles.title}>Funil</h1>
          <p className={styles.subtitle}>HubSpot → venda · cruzado com Meta Ads</p>
        </div>
        <DateRangeDropdown dateKey={dateKey} onDateKey={onDateKey} custom={custom} onCustom={onCustom} />
      </div>

      {err ? (
        <div className={styles.errorBox}><TriangleAlert size={16} /> {err}</div>
      ) : loading || !funnel ? (
        <div className={styles.loading}><Loader2 className={styles.spin} size={30} /></div>
      ) : (
        <>
          <div className={styles.card}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thStage}>Etapa</th>
                  <th className={styles.thNum}>Total</th>
                  <th className={styles.thNum}>Tráfego</th>
                  <th className={styles.thNum}>Orgânico</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(row => {
                  const r = row.get()
                  const fmt = (v: number) => (row.money ? formatBRL(v) : int(v))
                  const Icon = row.icon
                  return (
                    <tr key={row.key} className={row.money ? styles.moneyRow : ''}>
                      <td className={styles.tdStage}><Icon size={15} /> <span>{row.label}</span></td>
                      <td className={styles.tdNum}><strong>{r ? fmt(r.total) : '—'}</strong></td>
                      <td className={styles.tdNum}><span className={styles.paid}>{r ? fmt(r.trafego) : '—'}</span></td>
                      <td className={styles.tdNum}><span className={styles.org}>{r ? fmt(r.organico) : '—'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {leadsError && (
              <div className={styles.divergence}>
                <TriangleAlert size={14} />
                <span>
                  <strong>Leads, MQL e SQL indisponíveis.</strong> {leadsError}{' '}
                  Vendas e Faturamento acima são reais.
                </span>
              </div>
            )}
          </div>

          {/* Funil trapezoidal (mesmo estilo da aba Meta Ads), a partir da tabela acima */}
          <div className={styles.card}>
            <h3 className={styles.funnelHead}><Filter size={15} /> Funil de conversão</h3>
            <div className={styles.funnel}>
              {[
                { label: 'Leads', val: stage('leads')?.total ?? 0 },
                { label: 'MQL', val: stage('mql')?.total ?? 0 },
                { label: 'SQL', val: stage('sql')?.total ?? 0 },
                { label: 'Vendas', val: funnel.sales.total },
              ].map((s, i, arr) => {
                const prev = i === 0 ? s.val : arr[i - 1].val
                const stepPct = prev ? (s.val / prev) * 100 : 0
                const clip = `polygon(${FUNNEL_INSETS[i]}% 0, ${100 - FUNNEL_INSETS[i]}% 0, ${100 - FUNNEL_INSETS[i + 1]}% 100%, ${FUNNEL_INSETS[i + 1]}% 100%)`
                return (
                  <div key={s.label} className={styles.funStage}>
                    <span className={styles.funStep}>Etapa {i + 1}</span>
                    <div
                      className={`${styles.funSeg} ${FUNNEL_DARKTEXT[i] ? styles.funDark : ''}`}
                      style={{ clipPath: clip, background: FUNNEL_FILLS[i] }}
                    >
                      <span className={styles.funName}>{s.label}</span>
                      <span className={styles.funValue}>
                        {int(s.val)}{i > 0 && <span className={styles.funPct}> ({pct(stepPct)})</span>}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <p className={styles.assumptions}>
            <span>
              <strong>Tráfego</strong> = Canal de Entrada é <em>Formulários Meta</em> ou <em>Google Ads</em>;{' '}
              <strong>Orgânico</strong> = qualquer outro canal (incluindo em branco). Período aplicado por etapa:{' '}
              <strong>Leads</strong> e <strong>MQL</strong> pela data de entrada em <em>Novo</em> (MQL exclui os
              desqualificados por perfil, contato inválido, cliente ativo, duplicado ou paciente);{' '}
              <strong>SQL</strong> pela data de entrada em <em>Qualificado</em>; <strong>Vendas</strong> e{' '}
              <strong>Faturamento</strong> pela data de entrada em <em>Negócio Ganho (Closer)</em>.
            </span>
          </p>
        </>
      )}
    </div>
  )
}
