'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AnalyticsView from '@/components/analytics/AnalyticsView'

function AnalyticsInner() {
  const params = useSearchParams()
  const raw = params.get('source')
  const source = raw === 'planilha' ? 'planilha' : raw === 'site' ? 'site' : 'meta'
  return <AnalyticsView source={source} />
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsInner />
    </Suspense>
  )
}
