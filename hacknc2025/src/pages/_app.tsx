import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ProfileProvider } from '@/contexts/profileContext'
import { Press_Start_2P } from 'next/font/google'

const pressStart2P = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-press-start',
})

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ProfileProvider>
      <div className={`${pressStart2P.variable}`}>
        <style jsx global>{`
          * {
            font-family: var(--font-press-start), monospace !important;
          }
        `}</style>
        <Component {...pageProps} />
      </div>
    </ProfileProvider>
  )
}
