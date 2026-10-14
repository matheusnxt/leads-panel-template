import { notFound } from 'next/navigation'
import UiPreview from '@/components/dev/UiPreview'

// Bancada de UI — existe apenas em desenvolvimento.
// Em produção a rota responde 404, então nunca fica exposta.
export default function UiPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <UiPreview />
}
