import React from 'react'
import { useProfile } from '@/contexts/profileContext'

interface HeaderProps {
  isSaving?: boolean;
  isPlaying?: boolean;
  onSave?: () => void;
  onSaveAs?: () => void;
  onExportMidi?: () => void;
}

export default function Header({
  isSaving = false,
  isPlaying = false,
  onSave,
  onSaveAs,
  onExportMidi,
}: HeaderProps) {
  const { signOut } = useProfile()

  const handleMyProjects = () => {
    // navigate to projects page
    window.location.href = '/projects'
  }

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <header className="w-full bg-gray-900 border-b-4 border-cyan-400 shadow-[0_4px_0px_0px_rgba(0,139,139,1)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-green-400" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.8)' }}>
              8-BIT BEAT MAKER
            </h1>
          </div>

          {/* Navigation and action buttons */}
          <div className="flex items-center gap-2">
            {onSave && (
              <button
                onClick={onSave}
                disabled={isSaving || isPlaying}
                className="px-4 py-2 text-[10px] font-bold text-black bg-cyan-400 border-2 border-cyan-600 hover:bg-cyan-500 transition-all focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,139,139,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'SAVING...' : 'SAVE'}
              </button>
            )}
            {onSaveAs && (
              <button
                onClick={onSaveAs}
                disabled={isSaving || isPlaying}
                className="px-4 py-2 text-[10px] font-bold text-black bg-yellow-400 border-2 border-yellow-600 hover:bg-yellow-500 transition-all focus:outline-none shadow-[2px_2px_0px_0px_rgba(139,69,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                SAVE AS
              </button>
            )}
            {onExportMidi && (
              <button
                onClick={onExportMidi}
                disabled={isPlaying}
                className="px-4 py-2 text-[10px] font-bold text-white bg-pink-500 border-2 border-pink-700 hover:bg-pink-600 transition-all focus:outline-none shadow-[2px_2px_0px_0px_rgba(139,0,139,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                title="Download as MIDI file"
              >
                EXPORT MIDI
              </button>
            )}
            <button
              onClick={handleMyProjects}
              className="px-4 py-2 text-[10px] font-bold text-black bg-yellow-400 border-2 border-yellow-600 hover:bg-yellow-500 transition-all focus:outline-none shadow-[2px_2px_0px_0px_rgba(139,69,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              MY PROJECTS
            </button>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-[10px] font-bold text-white bg-red-500 border-2 border-red-700 hover:bg-red-600 transition-all focus:outline-none shadow-[2px_2px_0px_0px_rgba(127,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              SIGN OUT
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

