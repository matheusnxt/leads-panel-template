'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, Check, ChartPie, AArrowDown, AArrowUp, Download, FileText, FileSpreadsheet, FileType, SlidersHorizontal, Star } from 'lucide-react'
import { type DateRangeKey } from '@/lib/dateRange'
import DateRangeDropdown from './DateRangeDropdown'
import styles from './FilterBar.module.css'

type Props = {
  forms: string[]
  selectedForms: string[]
  onToggleForm: (form: string) => void
  onClearForms: () => void
  sortAsc: boolean
  onToggleSort: () => void
  total: number
  dateKey: DateRangeKey
  onDateKey: (k: DateRangeKey) => void
  custom: { from: string; to: string }
  onCustom: (c: { from: string; to: string }) => void
  source: 'meta' | 'planilha' | 'site' | 'upload'
  listSize: 'sm' | 'md' | 'lg'
  onListSize: (s: 'sm' | 'md' | 'lg') => void
  showSize: boolean
  bands: string[]
  onToggleBand: (b: string) => void
  onExport: (format: 'csv' | 'xlsx' | 'pdf') => void
}

const SIZES: ('sm' | 'md' | 'lg')[] = ['sm', 'md', 'lg']
const BANDS: { key: string; label: string; color: string; star?: boolean }[] = [
  { key: 'red', label: 'Frio', color: 'hsl(0, 75%, 45%)' },
  { key: 'yellow', label: 'Morno', color: 'hsl(48, 90%, 45%)' },
  { key: 'green', label: 'Quente', color: 'hsl(120, 65%, 38%)' },
  { key: 'star', label: 'Ideais', color: '#F59E0B', star: true },
]

export default function FilterBar({
  forms, selectedForms, onToggleForm, onClearForms,
  sortAsc, onToggleSort, total,
  dateKey, onDateKey, custom, onCustom, source,
  listSize, onListSize, showSize, bands, onToggleBand, onExport,
}: Props) {
  const decSize = () => onListSize(SIZES[Math.max(0, SIZES.indexOf(listSize) - 1)])
  const incSize = () => onListSize(SIZES[Math.min(2, SIZES.indexOf(listSize) + 1)])
  const [open, setOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const allSelected = selectedForms.length === 0
  const formLabel = allSelected
    ? 'Todos os formulários'
    : `${selectedForms.length} formulário${selectedForms.length > 1 ? 's' : ''}`

  return (
    <div className={styles.wrap}>
      <button className={styles.mobileToggle} onClick={() => setCollapsed(c => !c)}>
        <SlidersHorizontal size={16} />
        <span>Filtros</span>
        <span className={styles.toggleCount}>{total} {total === 1 ? 'lead' : 'leads'}</span>
        <ChevronDown size={16} className={collapsed ? '' : styles.chevOpen} />
      </button>

    <div className={`${styles.bar} ${collapsed ? styles.barCollapsed : ''}`}>
      <div className={styles.left}>
        <div className={styles.dropdown} ref={ref}>
          <button className={styles.dropdownBtn} onClick={() => setOpen(o => !o)}>
            <span>{formLabel}</span>
            <ChevronDown size={15} className={open ? styles.chevOpen : ''} />
          </button>

          {open && (
            <div className={styles.menu}>
              <button className={styles.menuClear} onClick={onClearForms}>
                Selecionar todos
              </button>
              <div className={styles.menuList}>
                {forms.map(form => {
                  const checked = selectedForms.includes(form)
                  return (
                    <button
                      key={form}
                      className={styles.menuItem}
                      onClick={() => onToggleForm(form)}
                    >
                      <span className={`${styles.checkbox} ${checked ? styles.checkboxOn : ''}`}>
                        {checked && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className={styles.menuItemLabel}>{form}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <DateRangeDropdown dateKey={dateKey} onDateKey={onDateKey} custom={custom} onCustom={onCustom} />

        <button className={styles.sortBtn} onClick={onToggleSort}>
          {sortAsc
            ? <ArrowUpNarrowWide size={15} strokeWidth={1.75} />
            : <ArrowDownWideNarrow size={15} strokeWidth={1.75} />}
          <span>{sortAsc ? 'Mais antigos' : 'Mais recentes'}</span>
        </button>

        <div className={styles.bands} title="Filtrar por lead score">
          {BANDS.map(b => {
            const on = bands.includes(b.key)
            return (
              <button
                key={b.key}
                className={`${styles.bandChip} ${on ? styles.bandOn : ''}`}
                style={on ? { background: b.color, borderColor: b.color, color: '#fff' } : { color: b.color, borderColor: b.color }}
                onClick={() => onToggleBand(b.key)}
              >
                {b.star
                  ? <Star size={13} fill={on ? '#fff' : b.color} strokeWidth={0} />
                  : <span className={styles.bandDot} style={{ background: on ? '#fff' : b.color }} />}
                {b.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.right}>
        {showSize && (
          <div className={styles.sizeCtrl} title="Tamanho da lista">
            <button onClick={decSize} disabled={listSize === 'sm'} aria-label="Diminuir">
              <AArrowDown size={17} strokeWidth={1.75} />
            </button>
            <button onClick={incSize} disabled={listSize === 'lg'} aria-label="Aumentar">
              <AArrowUp size={17} strokeWidth={1.75} />
            </button>
          </div>
        )}
        <span className={styles.count}>{total} {total === 1 ? 'lead' : 'leads'}</span>

        <div className={styles.dropdown} ref={exportRef}>
          <button className={styles.exportBtn} onClick={() => setExportOpen(o => !o)}>
            <Download size={15} strokeWidth={1.75} />
            <span>Exportar</span>
            <ChevronDown size={14} className={exportOpen ? styles.chevOpen : ''} />
          </button>
          {exportOpen && (
            <div className={`${styles.menu} ${styles.menuRight}`}>
              <button className={styles.menuItem} onClick={() => { onExport('csv'); setExportOpen(false) }}>
                <FileText size={15} /> <span className={styles.menuItemLabel}>CSV</span>
              </button>
              <button className={styles.menuItem} onClick={() => { onExport('xlsx'); setExportOpen(false) }}>
                <FileSpreadsheet size={15} /> <span className={styles.menuItemLabel}>Excel (.xlsx)</span>
              </button>
              <button className={styles.menuItem} onClick={() => { onExport('pdf'); setExportOpen(false) }}>
                <FileType size={15} /> <span className={styles.menuItemLabel}>PDF</span>
              </button>
            </div>
          )}
        </div>

        <Link href={`/analytics?source=${source}`} className={styles.analyticsBtn}>
          <ChartPie size={15} strokeWidth={1.75} />
          <span>Analytics</span>
        </Link>
      </div>
    </div>
    </div>
  )
}
