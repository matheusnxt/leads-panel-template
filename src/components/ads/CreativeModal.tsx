'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, ImageOff } from 'lucide-react'
import styles from './MetaAdsView.module.css'

type Media =
  | { type: 'iframe'; src: string }
  | { type: 'image'; url: string }
  | { type: 'none' }

// Abre o criativo de um anúncio em tela cheia (vídeo ou imagem).
export default function CreativeModal({ adId, name, onClose }: {
  adId: string | null
  name?: string
  onClose: () => void
}) {
  const [media, setMedia] = useState<Media | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!adId) return
    setMedia(null); setError(null)
    let cancel = false
    fetch(`/api/meta-ads/creative-media?adId=${adId}`)
      .then(r => r.json())
      .then(d => { if (!cancel) { if (d.error) setError(d.error); else setMedia(d) } })
      .catch(e => { if (!cancel) setError(e.message) })
    return () => { cancel = true }
  }, [adId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!adId) return null

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>{name ?? 'Criativo'}</span>
          <button className={styles.modalClose} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className={styles.modalMedia}>
          {!media && !error && <Loader2 className={styles.spin} size={30} />}
          {error && <div className={styles.modalEmpty}><ImageOff size={26} /> <span>{error}</span></div>}
          {media?.type === 'iframe' && (
            <iframe src={media.src} className={styles.modalFrame} title={name ?? 'Criativo'} allow="autoplay; encrypted-media" />
          )}
          {media?.type === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt={name ?? 'Criativo'} className={styles.modalImage} />
          )}
          {media?.type === 'none' && <div className={styles.modalEmpty}><ImageOff size={26} /> <span>Sem mídia disponível</span></div>}
        </div>
      </div>
    </div>
  )
}
