import { useCallback, useRef, useState } from "react";
import Block from "@/components/Block";
import Header from "@/components/Header";

const TRACKS = 4;
const STEPS = 16;

// Available notes for dropdown
const AVAILABLE_NOTES = [
  "C2", "C#2", "D2", "D#2", "E2", "F2", "F#2", "G2", "G#2", "A2", "A#2", "B2",
  "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
  "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4",
  "C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5", "G#5", "A5", "A#5", "B5",
];

export default function Home() {
  const toneRef = useRef<any | null>(null);
  const synthRef = useRef<any | null>(null);
  
  // Initialize 2D grid: [tracks][steps]
  const [grid, setGrid] = useState<boolean[][]>(() =>
    Array.from({ length: TRACKS }, () => Array(STEPS).fill(false))
  );
  
  // Track notes - each row has its own note
  const [trackNotes, setTrackNotes] = useState<string[]>(["C3", "E3", "G3", "C4"]);

  const playSound = useCallback(async (note: string) => {
    // Load Tone dynamically (single entry for type safety)
    const mod = await import("tone");
    const ns: any = mod as any;
    const DefaultNS: any = (ns && ns.default) ? ns.default : undefined;
    const GlobalNS: any = (globalThis as any).Tone ?? undefined;

    // Prefer ESM named exports, then default namespace, then global UMD namespace
    const ToneNS: any = (ns && (ns.start || ns.MembraneSynth || ns.Synth)) ? ns
      : (DefaultNS && (DefaultNS.start || DefaultNS.MembraneSynth || DefaultNS.Synth)) ? DefaultNS
      : GlobalNS;

    const MembraneCtorCandidates: any[] = [
      ToneNS?.MembraneSynth,
    ].filter(Boolean);
    const SynthCtorCandidates: any[] = [
      ToneNS?.Synth,
    ].filter(Boolean);
    const start: any = ToneNS?.start;
    const context: any = ToneNS?.context;

    if (typeof start === "function") {
      await start();
    } else if (context && typeof context.resume === "function") {
      await context.resume();
    }

    const tryConstruct = (candidates: any[]): any | null => {
      for (const c of candidates) {
        try {
          if (typeof c === 'function') {
            const inst = new c();
            return inst;
          }
        } catch (_e) {
          // keep trying
        }
      }
      return null;
    };

    // Create a new synth instance each time to avoid timing conflicts
    const mem = tryConstruct(MembraneCtorCandidates);
    const basic = mem ? null : tryConstruct(SynthCtorCandidates);

    let tempSynth: any = null;
    if (mem) {
      tempSynth = mem.toDestination();
    } else if (basic) {
      tempSynth = basic.toDestination();
    } else {
      // Log available keys once to help diagnose
      const keys = ToneNS ? Object.keys(ToneNS) : [];
      console.warn('No constructable Tone synth found on Tone namespace. keys=', keys);
      return;
    }

    // Trigger sound and dispose after
    try {
      tempSynth.triggerAttackRelease(note, "8n");
      // Dispose after sound finishes (8n = eighth note, roughly 0.5s)
      setTimeout(() => {
        if (tempSynth && typeof tempSynth.dispose === 'function') {
          tempSynth.dispose();
        }
      }, 1000);
    } catch (e) {
      console.warn('Error triggering sound:', e);
      if (tempSynth && typeof tempSynth.dispose === 'function') {
        tempSynth.dispose();
      }
    }
  }, []);

  const handleNoteChange = useCallback((trackIndex: number, newNote: string) => {
    setTrackNotes(prev => {
      const updated = [...prev];
      updated[trackIndex] = newNote;
      return updated;
    });
  }, []);

  const handleToggle = useCallback((trackIndex: number, stepIndex: number) => {
    setGrid((prevGrid) => {
      const newGrid = prevGrid.map(row => [...row]);
      const wasActive = newGrid[trackIndex][stepIndex];
      newGrid[trackIndex][stepIndex] = !wasActive;
      
      // Only play sound when transitioning from inactive to active
      if (!wasActive) {
        playSound(trackNotes[trackIndex]);
      }
      
      return newGrid;
    });
  }, [playSound, trackNotes]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="flex items-center justify-center p-8">
        <div className="space-y-2">
          {grid.map((track, trackIndex) => (
            <div key={trackIndex} className="flex items-center gap-3">
              {/* Note Selector */}
              <select
                value={trackNotes[trackIndex]}
                onChange={(e) => handleNoteChange(trackIndex, e.target.value)}
                className="px-3 py-1 text-sm font-medium border border-slate-300 rounded-md bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
              >
                {AVAILABLE_NOTES.map((note) => (
                  <option key={note} value={note}>
                    {note}
                  </option>
                ))}
              </select>

              {/* Blocks for this track */}
              <div className="flex gap-1">
                {track.map((isActive, stepIndex) => (
                  <Block
                    key={`${trackIndex}-${stepIndex}`}
                    trackIndex={trackIndex}
                    stepIndex={stepIndex}
                    isActive={isActive}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
