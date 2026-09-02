'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleDollarSign } from 'lucide-react'
import { digitsToNumber, formatBRLNumber } from '@/lib/currency'
import styles from './StageModal.module.css'

type Props = {
  leadName: string
  initialValue?: number | null
  onConfirm: (value: number) => void
  onCancel: () => void
}

export default function ConversionValueModal({ leadName, initialValue, onConfirm, onCancel }: Props) {
  // Estado guardado como string mascarada ("1.234,56").
  const [display, setDisplay] = useState(
    initialValue != null ? formatBRLNumber(initialValue) : '',
  )
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  const value = digitsToNumber(display)
  const valid = value != null && value > 0

  const handleChange = (raw: string) => {
    const n = digitsToNumber(raw)
    setDisplay(n == null ? '' : formatBRLNumber(n))
  }

  const submit = () => { if (valid) onConfirm(value!) }

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={`${styles.iconWrap} ${styles.iconConv}`}>
            <CircleDollarSign size={19} />
          </div>
          <div>
            <div className={styles.title}>Valor da conversão</div>
            <div className={styles.subtitle}>{leadName}</div>
          </div>
        </div>

        <div className={styles.body}>
          <div>
            <label className={styles.label}>Valor do fechamento (obrigatório)</label>
            <div className={styles.currencyInput}>
              <span className={styles.currencyPrefix}>R$</span>
              <input
                ref={inputRef}
                className={styles.currencyField}
                inputMode="numeric"
                placeholder="0,00"
                value={display}
                onChange={e => handleChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit() }}
              />
            </div>
          </div>
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
