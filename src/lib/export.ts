import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from './supabase'
import { APP_NAME } from './brand'
import { scoreLead } from './leadScore'
import type { Lead } from './supabase'

const STATUS: Record<string, string> = {
  novo: 'Novo', em_contato: 'Em Contato', convertido: 'Convertido', perdido: 'Perdido',
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Colunas base + todas as perguntas presentes nos leads
function buildTable(leads: Lead[]): { headers: string[]; rows: string[][]; baseHeaders: string[]; baseRows: string[][] } {
  const customKeys = new Set<string>()
  for (const l of leads) for (const k of Object.keys(l.custom_questions ?? {})) customKeys.add(k)
  const custom = [...customKeys].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const baseHeaders = ['Nome', 'Telefone', 'E-mail', 'Formulário', 'Status', 'Score', 'Conversões', 'Data']
  const headers = [...baseHeaders, ...custom]

  const rows: string[][] = []
  const baseRows: string[][] = []
  for (const l of leads) {
    const score = scoreLead(l)?.score ?? ''
    const conv = (l as { conversions?: number }).conversions ?? 1
    const base = [
      l.name || '', l.phone || '', l.email || '', l.form_name || '',
      STATUS[l.status] || l.status, String(score), String(conv), fmtDate(l.created_at),
    ]
    baseRows.push(base)
    rows.push([...base, ...custom.map(k => l.custom_questions?.[k] || '')])
  }
  return { headers, rows, baseHeaders, baseRows }
}

function fileName(source: string, ext: string) {
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return `leads-${source}-${ts}.${ext}`
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

// Gera o arquivo no formato pedido e retorna { blob, name }
export function buildExport(leads: Lead[], format: ExportFormat, source: string): { blob: Blob; name: string } {
  const { headers, rows, baseHeaders, baseRows } = buildTable(leads)

  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(14)
    doc.text(`${APP_NAME} — Leads`, 14, 14)
    doc.setFontSize(9)
    doc.text(`${leads.length} leads · ${fmtDate(new Date().toISOString())}`, 14, 20)
    autoTable(doc, {
      head: [baseHeaders], body: baseRows, startY: 24, styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [13, 40, 55] },
    })
    return { blob: doc.output('blob'), name: fileName(source, 'pdf') }
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws)
    return { blob: new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), name: fileName(source, 'csv') }
  }
  // xlsx
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: fileName(source, 'xlsx') }
}

// Dispara o download no navegador
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Sobe o arquivo para o Storage (bucket privado) e retorna o CAMINHO.
// O download é feito depois via URL assinada temporária (lib/activity).
export async function uploadExport(blob: Blob, name: string): Promise<string | null> {
  const path = `${Date.now()}-${name}`
  const { error } = await supabase.storage.from('exports').upload(path, blob, {
    contentType: blob.type, upsert: false,
  })
  return error ? null : path
}
