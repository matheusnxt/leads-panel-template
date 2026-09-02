'use client'

import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { LOSS_REASONS, OTHER_REASON } from '@/lib/lossReasons'
import styles from './StageModal.module.css'

type Props = {
  leadName: string
  initialReason?: string | null
  initialNote?: string | null
  onConfirm: (reason: string, note: string | null) => void
  onCancel: () => void
}

export default function LossReasonModal({ leadName, initialReason, initialNote, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState(initialReason ?? '')
  const [note, setNote] = useState(initialNote ?? '')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  const isOther = reason === OTHER_REASON
  const valid = reason.trim() !== ''

  const submit = () => {
    if (!valid) return
    onConfirm(reason, isOther ? (note.trim() || null) : null)
  }

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={`${styles.iconWrap} ${styles.iconLoss}`}>
            <TriangleAlert size={18} />
          </div>
          <div>
            <div className={styles.title}>Motivo da perda</div>
            <div className={styles.subtitle}>{leadName}</div>
          </div>
        </div>

        <div className={styles.body}>
          <div>
            <label className={styles.label}>Motivo (obrigatório)</label>
            <select
              className={styles.select}
              value={reason}
              onChange={e => setReason(e.target.value)}
              autoFocus
            >
              <option value="" disabled>Selecione um motivo…</option>
              {LOSS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {isOther && (
            <div>
              <label className={styles.label}>Descreva o motivo (opcional)</label>
              <textarea
                className={styles.textarea}
                placeholder="Detalhe o motivo da perda…"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={`${styles.btn} ${styles.btnCancel}`} onClick={onCancel}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnConfirm}`} onClick={submit} disabled={!valid}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
