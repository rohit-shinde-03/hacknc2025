import { useCallback, useRef, useState, useEffect } from 'react';

interface Instrument {
  name: string;
  type: string;
  pitchCount: number;
  baseNote: string;
  notes: string[];
}

export function useToneSequencer(
  instruments: Instrument[],
  grid: boolean[][][],
  steps: number,
  bpm: number
) {
  const toneRef = useRef<any | null>(null);
  const synthsRef = useRef<any[]>([]);
  const sequenceRef = useRef<any>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);

  const playSound = useCallback(async (note: string, waveform: string) => {
    const mod = await import("tone");
    const ns: any = mod as any;
    const DefaultNS: any = (ns && ns.default) ? ns.default : undefined;
    const GlobalNS: any = (globalThis as any).Tone ?? undefined;

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

    let tempSynth: any = null;
    try {
      if (ToneNS?.Synth) {
        tempSynth = new ToneNS.Synth({
          oscillator: { type: waveform }
        }).toDestination();
        tempSynth.triggerAttackRelease(note, "32n");

        setTimeout(() => {
          try {
            tempSynth?.dispose();
          } catch (e) {
            console.error("Error disposing temp synth:", e);
          }
        }, 300);
      }
    } catch (err) {
      console.error("Error playing sound:", err);
      if (tempSynth) {
        try {
          tempSynth.dispose();
        } catch (e) {
          console.error("Error disposing synth on error:", e);
        }
      }
    }
  }, []);

  const initializeSynths = useCallback(async () => {
    try {
      const mod = await import("tone");
      const ns: any = mod as any;
      const DefaultNS: any = (ns && ns.default) ? ns.default : undefined;
      const GlobalNS: any = (globalThis as any).Tone ?? undefined;

      // Prefer ESM named exports, then default namespace, then global UMD namespace
      const ToneNS: any = (ns && (ns.start || ns.Synth)) ? ns
        : (DefaultNS && (DefaultNS.start || DefaultNS.Synth)) ? DefaultNS
          : GlobalNS;

      if (!ToneNS || !ToneNS.PolySynth || !ToneNS.Synth) {
        console.error("Tone.js not properly loaded", { ToneNS });
        return false;
      }

      toneRef.current = ToneNS;

      const newSynths = instruments.map((instrument) =>
        new ToneNS.PolySynth(ToneNS.Synth, {
          oscillator: { type: instrument.type },
        }).toDestination()
      );

      synthsRef.current = newSynths;
      return true;
    } catch (error) {
      console.error("Error initializing synths:", error);
      return false;
    }
  }, [instruments]);

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      try {
        if (sequenceRef.current) {
          sequenceRef.current.stop("+0.1");
          sequenceRef.current.dispose();
          sequenceRef.current = null;
        }
        if (toneRef.current?.Transport) {
          toneRef.current.Transport.stop("+0.1");
        }
      } catch (error) {
        console.error("Error stopping playback:", error);
      }
      setIsPlaying(false);
      setCurrentStep(-1);
      return;
    }

    setIsLoading(true);

    try {
      if (synthsRef.current.length === 0) {
        console.log("Initializing synths...");
        const success = await initializeSynths();
        if (!success) {
          throw new Error("Failed to initialize Tone.js. Please refresh the page and try again.");
        }
        console.log("Synths initialized successfully");
      }

      const ToneNS = toneRef.current;
      if (!ToneNS) {
        throw new Error("Tone.js not loaded. Please refresh the page and try again.");
      }

      console.log("Starting Tone.js audio context...");
      await ToneNS.start();
      if (ToneNS.context) {
        await ToneNS.context.resume();
      }

      ToneNS.Transport.bpm.value = bpm;
      console.log(`BPM set to ${bpm}`);

      sequenceRef.current = new ToneNS.Sequence(
        (time: number, step: number) => {
          ToneNS.Draw.schedule(() => {
            setCurrentStep(step);
          }, time);

          instruments.forEach((instrument, instrumentIndex) => {
            for (let pitchIndex = 0; pitchIndex < instrument.pitchCount; pitchIndex++) {
              if (grid[instrumentIndex][pitchIndex][step]) {
                const note = instruments[instrumentIndex].notes[pitchIndex];
                synthsRef.current[instrumentIndex].triggerAttackRelease(note, "16n", time);
              }
            }
          });
        },
        Array.from({ length: steps }, (_, i) => i),
        "16n"
      );

      sequenceRef.current.loop = true;
      sequenceRef.current.start(0);
      ToneNS.Transport.start();

      setIsPlaying(true);
      console.log("Playback started successfully");
    } catch (error: any) {
      console.error("Error starting playback:", error);
      const errorMessage = error?.message || "Failed to start audio playback. Please try again.";
      alert(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, initializeSynths, bpm, grid, instruments, steps]);

  const handleClear = useCallback(() => {
    if (window.confirm("Are you sure you want to clear the entire grid?")) {
      return true;
    }
    return false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (toneRef.current?.Transport) {
          toneRef.current.Transport.stop();
          toneRef.current.Transport.cancel();
        }
        if (sequenceRef.current) {
          sequenceRef.current.dispose();
        }
        synthsRef.current.forEach((synth) => {
          try {
            synth?.dispose();
          } catch (e) {
            console.error("Error disposing synth:", e);
          }
        });
      } catch (error) {
        console.error("Cleanup error:", error);
      }
    };
  }, []);

  return {
    isPlaying,
    currentStep,
    isLoading,
    playSound,
    handlePlay,
    handleClear,
  };
}

