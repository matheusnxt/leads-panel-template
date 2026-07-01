'use client'

import { Star } from 'lucide-react'
import { scoreColor, type ScoreResult } from '@/lib/leadScore'
import styles from './ScoreGauge.module.css'

const R = 15
const CIRC = 2 * Math.PI * R

export default function ScoreGauge({ result, size = 34 }: { result: ScoreResult; size?: number }) {
  if (!result) {
    return <span className={styles.empty} style={{ width: size, height: size }}>—</span>
  }
  const { score, star } = result
  const color = scoreColor(score)
  const arc = (score / 100) * CIRC

  return (
    <div className={styles.gauge} style={{ width: size, height: size }} title={`Lead score: ${score}/100`}>
      <svg viewBox="0 0 36 36" className={styles.svg}>
        <circle cx="18" cy="18" r={R} fill="none" stroke="var(--muted)" strokeWidth="4" opacity="0.45" />
        <circle
          cx="18" cy="18" r={R} fill="none"
          stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${arc} ${CIRC - arc}`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className={styles.num} style={{ color, fontSize: size * 0.34 }}>{score}</span>
      {star && <Star className={styles.star} size={size * 0.34} fill="#F59E0B" strokeWidth={0} />}
    </div>
  )
}
