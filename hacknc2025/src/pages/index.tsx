import { useCallback, useRef, useState } from "react";
import Block from "@/components/Block";
import Header from "@/components/Header";

const TRACKS = 4;
const STEPS = 16;
const NOTES = ["C3", "E3", "G3", "C4"]; // Different note for each track

export default function Home() {
  const toneRef = useRef<any | null>(null);
  const synthRef = useRef<any | null>(null);
  
  // Initialize 2D grid: [tracks][steps]
  const [grid, setGrid] = useState<boolean[][]>(() =>
    Array.from({ length: TRACKS }, () => Array(STEPS).fill(false))
  );

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

  const handleToggle = useCallback((trackIndex: number, stepIndex: number) => {
    setGrid((prevGrid) => {
      const newGrid = prevGrid.map(row => [...row]);
      const wasActive = newGrid[trackIndex][stepIndex];
      newGrid[trackIndex][stepIndex] = !wasActive;
      
      // Only play sound when transitioning from inactive to active
      if (!wasActive) {
        playSound(NOTES[trackIndex]);
      }
      
      return newGrid;
    });
  }, [playSound]);

  const handleMyProjects = () => {
    // TODO: Navigate to projects page
    console.log('My Projects clicked');
  };

  const handleSignOut = () => {
    // TODO: Implement sign out
    console.log('Sign Out clicked');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header onSignOut={handleSignOut} onMyProjects={handleMyProjects} />
      <div className="flex items-center justify-center p-8">
        <div className="space-y-1">
          {grid.map((track, trackIndex) => (
            <div key={trackIndex} className="flex gap-1">
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
          ))}
        </div>
      </div>
    </div>
  );
}
