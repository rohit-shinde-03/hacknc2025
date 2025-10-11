import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ToneProvider } from '@/contexts/ToneProvider'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ToneProvider>
      <Component {...pageProps} />
    </ToneProvider>
  )
}
