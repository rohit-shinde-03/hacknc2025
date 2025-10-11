import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { initToneSampler, getSampler } from '../utils/tone'

type ToneContextValue = {
  ready: boolean
  play: (noteOrName: string, dur?: string | number) => void
}

const ToneContext = createContext<ToneContextValue | null>(null)

export const ToneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    function onFirstGesture() {
      initToneSampler({
        baseUrl: '/samples/',
        urls: {
          C4: 'note_C4.wav',
          D4: 'note_D4.wav',
        },
      })
        .then(() => setReady(true))
        .catch(() => setReady(true))
    }

    window.addEventListener('click', onFirstGesture, { once: true, passive: true })
    window.addEventListener('keydown', onFirstGesture, { once: true, passive: true })

    return () => {
      window.removeEventListener('click', onFirstGesture)
      window.removeEventListener('keydown', onFirstGesture)
    }
  }, [])

  const ctxValue = useMemo(
    () => ({
      ready,
      play(noteOrName: string, dur: string | number = '8n') {
        const s = getSampler()
        if (!s) return
        s.triggerAttackRelease(noteOrName, dur)
      },
    }),
    [ready]
  )

  return <ToneContext.Provider value={ctxValue}>{children}</ToneContext.Provider>
}

export function useTone() {
  const ctx = useContext(ToneContext)
  if (!ctx) {
    return {
      ready: false,
      play: () => {},
    }
  }
  return ctx
}
