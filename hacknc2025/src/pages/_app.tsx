import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ToneProvider } from '@/contexts/ToneProvider'
import { ProfileProvider } from '@/contexts/profileContext'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ProfileProvider>
      <ToneProvider>
        <Component {...pageProps} />
      </ToneProvider>
    </ProfileProvider>
  )
}
