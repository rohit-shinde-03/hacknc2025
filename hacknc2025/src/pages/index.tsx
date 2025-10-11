import { useCallback, useRef, useState } from "react";
import Block from "@/components/Block";
import Header from "@/components/Header";

const STEPS = 24; // 24 time steps

// Instrument configuration: each instrument has multiple pitch rows
const INSTRUMENTS = [
  { 
    name: "Square", 
    type: "square", 
    pitchCount: 24, // 2 octaves
    baseNote: "C3",
    notes: [
      "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
      "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"
    ]
  },
  { 
    name: "Triangle", 
    type: "triangle", 
    pitchCount: 24, // 2 octaves (bass)
    baseNote: "C1",
    notes: [
      "C1", "C#1", "D1", "D#1", "E1", "F1", "F#1", "G1", "G#1", "A1", "A#1", "B1",
      "C2", "C#2", "D2", "D#2", "E2", "F2", "F#2", "G2", "G#2", "A2", "A#2", "B2"
    ]
  },
  { 
    name: "Pulse", 
    type: "pulse", 
    pitchCount: 12, // 1 octave
    baseNote: "C3",
    notes: [
      "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3"
    ]
  },
];

export default function Home() {
  const toneRef = useRef<any | null>(null);
  const synthsRef = useRef<any[]>([]);
  
  // Initialize 3D grid: [instrumentIndex][pitchIndex][stepIndex]
  // Each instrument has multiple pitch rows, each with STEPS time columns
  const [grid, setGrid] = useState<boolean[][][]>(() =>
    INSTRUMENTS.map(instrument => 
      Array.from({ length: instrument.pitchCount }, () => 
        Array(STEPS).fill(false)
      )
    )
  );

  const playSound = useCallback(async (note: string, waveform: string) => {
    // Load Tone dynamically (single entry for type safety)
    const mod = await import("tone");
    const ns: any = mod as any;
    const DefaultNS: any = (ns && ns.default) ? ns.default : undefined;
    const GlobalNS: any = (globalThis as any).Tone ?? undefined;

    // Prefer ESM named exports, then default namespace, then global UMD namespace
    const ToneNS: any = (ns && (ns.start || ns.Synth)) ? ns
      : (DefaultNS && (DefaultNS.start || DefaultNS.Synth)) ? DefaultNS
      : GlobalNS;

    const start: any = ToneNS?.start;
    const context: any = ToneNS?.context;

    if (typeof start === "function") {
      await start();
    } else if (context && typeof context.resume === "function") {
      await context.resume();
    }

    // Create a synth with the specified waveform
    let tempSynth: any = null;
    try {
      if (ToneNS?.Synth) {
        tempSynth = new ToneNS.Synth({
          oscillator: { type: waveform }
        }).toDestination();
      } else {
        console.warn('Tone.Synth not found');
        return;
      }
    } catch (e) {
      console.warn('Error creating synth:', e);
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

  const handleToggle = useCallback((instrumentIndex: number, pitchIndex: number, stepIndex: number) => {
    setGrid((prevGrid) => {
      const newGrid = prevGrid.map(instrument => 
        instrument.map(pitchRow => [...pitchRow])
      );
      const wasActive = newGrid[instrumentIndex][pitchIndex][stepIndex];
      newGrid[instrumentIndex][pitchIndex][stepIndex] = !wasActive;
      
      // Only play sound when transitioning from inactive to active
      if (!wasActive) {
        const note = INSTRUMENTS[instrumentIndex].notes[pitchIndex];
        const waveform = INSTRUMENTS[instrumentIndex].type;
        playSound(note, waveform);
      }
      
      return newGrid;
    });
  }, [playSound]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="flex items-center justify-center p-8">
        <div className="space-y-4">
          {INSTRUMENTS.map((instrument, instrumentIndex) => (
            <div key={instrumentIndex} className="flex items-start gap-2">
              {/* Instrument Label */}
              <div className="w-20 px-2 py-1 text-xs font-bold text-slate-700 bg-slate-200 rounded text-center sticky left-0">
                {instrument.name}
              </div>

              {/* Piano Roll Grid for this instrument */}
              <div className="flex flex-col-reverse border-2 border-black overflow-hidden">
                {/* Render pitch rows from high to low (reversed for natural piano layout) */}
                {grid[instrumentIndex].map((pitchRow, pitchIndex) => (
                  <div key={pitchIndex} className="flex">
                    {/* Render time steps in groups of 4 */}
                    {pitchRow.map((isActive, stepIndex) => {
                      // Add left border for group starts, but not the first column
                      const isGroupStart = stepIndex > 0 && stepIndex % 4 === 0;
                      // Add horizontal divider for all rows except the bottom one (pitchIndex 0 = bottom after reverse)
                      const needsHorizontalBorder = pitchIndex > 0;
                      return (
                        <button
                          key={stepIndex}
                          onClick={() => handleToggle(instrumentIndex, pitchIndex, stepIndex)}
                          className={`w-6 h-3 transition-colors relative ${
                            isGroupStart ? 'border-l-2 border-l-black' : ''
                          } ${
                            needsHorizontalBorder ? 'border-b border-b-slate-300' : ''
                          } ${
                            isActive 
                              ? 'bg-blue-500 hover:bg-blue-600' 
                              : 'bg-slate-200 hover:bg-slate-300'
                          }`}
                          aria-pressed={isActive}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
