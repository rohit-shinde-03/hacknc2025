// Dynamically import Tone only on the client to avoid SSR/build-time errors
export type SamplerMap = Record<string, string>

let Tone: any = null
let sampler: any = null
let nativeAudioCtx: AudioContext | null = null

async function importTone() {
  if (!Tone) {
    try {
      const mod = await import('tone')
      Tone = (mod && (mod as any).default) || mod
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to import tone:', err)
      Tone = null
    }
  }
  return Tone
}

export async function ensureToneStarted() {
  if (typeof window === 'undefined') return null
  const T = await importTone()
  if (!T) return null
  try {
    await T.start()
  } catch (e) {
    // ignore
  }
  return T
}

export function playImmediateClick() {
  if (typeof window === 'undefined') return
  try {
    if (!nativeAudioCtx) {
      nativeAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    const ac = nativeAudioCtx
    const duration = 0.02
    const sampleRate = ac.sampleRate
    const frameCount = Math.floor(sampleRate * duration)
    const buffer = ac.createBuffer(1, frameCount, sampleRate)
    const data = buffer.getChannelData(0)

    // short noise burst with quick decay
    for (let i = 0; i < frameCount; i++) {
      const env = 1 - i / frameCount
      data[i] = (Math.random() * 2 - 1) * env * 0.25
    }

    const src = ac.createBufferSource()
    src.buffer = buffer
    const gain = ac.createGain()
    gain.gain.value = 0.8
    src.connect(gain)
    gain.connect(ac.destination)
    src.start()
    // cleanup
    src.onended = () => {
      try {
        src.disconnect()
        gain.disconnect()
      } catch (e) {}
    }
  } catch (e) {
    // ignore
  }
}

export async function initToneSampler(options: {
  baseUrl?: string
  urls: Record<string, string>
  warmNote?: string
  warmGainDb?: number
}) {
  if (typeof window === 'undefined') return null

  const T = await ensureToneStarted()
  if (!T) return null

  if (sampler) return sampler

  const { baseUrl = '/samples/', urls, warmNote = 'C4', warmGainDb = -60 } = options

  // attempt to prefetch sample files to warm HTTP cache
  try {
    Object.values(urls).forEach((u) => {
      const url = baseUrl + u
      fetch(url).catch(() => {})
    })
  } catch (e) {
    // ignore
  }

  try {
    sampler = new T.Sampler({
      urls,
      baseUrl,
    }).toDestination()
  } catch (e) {
    sampler = null
  }

  try {
    await T.loaded()
  } catch (e) {
    // ignore
  }

  try {
    const now = T.now()
    if (sampler) {
      sampler.volume.value = warmGainDb
      sampler.triggerAttackRelease(warmNote, 0.001, now)
      sampler.volume.value = 0
    }
  } catch (e) {
    // ignore
  }

  return sampler
}

export function getSampler() {
  return sampler
}
