'use client'

import { PALETTE, type Slice, type TrendPoint } from '@/lib/analytics'
import { formatBRL } from '@/lib/currency'
import styles from './Charts.module.css'

const pct = (v: number, total: number) => total ? Math.round((v / total) * 100) : 0

// Cartão de métrica com número grande (estilo dashboard premium)
export function StatCard({ label, value, unit, accent }: {
  label: string; value: string | number; unit?: string; accent?: string
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={accent ? { color: accent } : undefined}>
        {value}{unit && <span className={styles.statUnit}>{unit}</span>}
      </div>
    </div>
  )
}

export function DonutChart({ data }: { data: Slice[] }) {
  const total = data.reduce((a, s) => a + s.value, 0)
  const r = 60
  const circ = 2 * Math.PI * r
  let offset = 0

  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 160 160" className={styles.donutSvg}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--muted)" strokeWidth="18" opacity="0.35" />
        <g transform="rotate(-90 80 80)">
          {data.map((s, i) => {
            const frac = total ? s.value / total : 0
            const len = frac * circ
            const seg = (
              <circle
                key={s.label}
                cx="80" cy="80" r={r}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth="18"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(len - 2, 0)} ${circ - Math.max(len - 2, 0)}`}
                strokeDashoffset={-offset}
              />
            )
            offset += len
            return seg
          })}
        </g>
        <text x="80" y="75" className={styles.donutTotal} textAnchor="middle">{total}</text>
        <text x="80" y="95" className={styles.donutTotalLabel} textAnchor="middle">leads</text>
      </svg>

      <div className={styles.legend}>
        {data.map((s, i) => (
          <div key={s.label} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className={styles.legendLabel}>{s.label}</span>
            <span className={styles.legendValue}>{pct(s.value, total)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Gráfico de barras verticais para evolução do faturamento (valores em BRL).
export function TrendChart({ points, unit }: { points: TrendPoint[]; unit: string }) {
  const max = Math.max(...points.map(p => p.value), 1)
  const total = points.reduce((a, p) => a + p.value, 0)

  if (points.length === 0) {
    return <div className={styles.trendEmpty}>Sem faturamento no período.</div>
  }

  return (
    <div className={styles.trend}>
      <div className={styles.trendBars}>
        {points.map((p, i) => (
          <div key={i} className={styles.trendCol} title={`${p.label}: ${formatBRL(p.value)}`}>
            <div className={styles.trendBarWrap}>
              <div
                className={styles.trendBar}
                style={{ height: `${Math.max((p.value / max) * 100, p.value > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className={styles.trendLabel}>{p.label}</span>
          </div>
        ))}
      </div>
      <div className={styles.trendFoot}>
        <span>Por {unit}</span>
        <span className={styles.trendTotal}>{formatBRL(total)}</span>
      </div>
    </div>
  )
}

export function BarChart({ data }: { data: Slice[] }) {
  const total = data.reduce((a, s) => a + s.value, 0)
  // A escala ignora "Outros" para não achatar as demais barras
  const max = Math.max(...data.filter(s => s.label !== 'Outros').map(s => s.value), 1)

  return (
    <div className={styles.bars}>
      {data.map((s, i) => {
        const color = PALETTE[i % PALETTE.length]
        const isOutros = s.label === 'Outros'
        return (
          <div key={s.label} className={`${styles.barRow} ${isOutros ? styles.barRowOutros : ''}`}>
            <div className={styles.barHead}>
              <span className={styles.barLabel}>{s.label}</span>
              <span className={styles.barValue}>
                <strong>{s.value}</strong> · {pct(s.value, total)}%
              </span>
            </div>
            {!isOutros && (
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{
                    width: `${(s.value / max) * 100}%`,
                    background: `linear-gradient(90deg, ${color}99, ${color})`,
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
