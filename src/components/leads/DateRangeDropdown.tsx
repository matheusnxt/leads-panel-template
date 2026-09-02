'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, Check } from 'lucide-react'
import { DATE_OPTIONS, type DateRangeKey } from '@/lib/dateRange'
import styles from './DateRangeDropdown.module.css'

// Seletor de período reutilizável (abas de leads + analytics).
export default function DateRangeDropdown({
  dateKey, onDateKey, custom, onCustom,
}: {
  dateKey: DateRangeKey
  onDateKey: (k: DateRangeKey) => void
  custom: { from: string; to: string }
  onCustom: (c: { from: string; to: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const dateLabel = DATE_OPTIONS.find(o => o.key === dateKey)?.label ?? 'Todo o período'

  return (
    <div className={styles.dropdown} ref={ref}>
      <button className={styles.dropdownBtn} onClick={() => setOpen(o => !o)}>
        <CalendarDays size={15} strokeWidth={1.75} />
        <span>{dateLabel}</span>
        <ChevronDown size={15} className={open ? styles.chevOpen : ''} />
      </button>

      {open && (
        <div className={styles.menu}>
          <div className={styles.menuList}>
            {DATE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                className={styles.menuItem}
                onClick={() => {
                  onDateKey(opt.key)
                  if (opt.key !== 'custom') setOpen(false)
                }}
              >
                <span className={`${styles.radio} ${dateKey === opt.key ? styles.radioOn : ''}`}>
                  {dateKey === opt.key && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={styles.menuItemLabel}>{opt.label}</span>
              </button>
            ))}
          </div>

          {dateKey === 'custom' && (
            <div className={styles.customRange}>
              <label>
                <span>De</span>
                <input type="date" value={custom.from} onChange={e => onCustom({ ...custom, from: e.target.value })} />
              </label>
              <label>
                <span>Até</span>
                <input type="date" value={custom.to} onChange={e => onCustom({ ...custom, to: e.target.value })} />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
