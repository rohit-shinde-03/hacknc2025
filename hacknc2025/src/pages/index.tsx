import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/router";

import Header from "@/components/Header";
import ControlPanel from "@/components/ControlPanel";
import SequencerGrid from "@/components/SequencerGrid";
import SaveModal from "@/components/SaveModal";

import { useToneSequencer } from "@/hooks/useToneSequencer";
import { useProjectManager } from "@/hooks/useProjectManager";

import { exportToMidi } from "../../utils/midiExport";
import { getProject } from "../../utils/projects";

// --------------------
// Config
// --------------------
const MIN_STEPS = 16;
const MAX_STEPS = 64;

const INSTRUMENTS = [
  {
    name: "Square",
    type: "square",
    pitchCount: 36,
    baseNote: "G#3", // ← required
    notes: [
      "G#3","A3","A#3","B3","C4","C#4","D4","D#4","E4","F4","F#4","G4",
      "G#4","A4","A#4","B4","C5","C#5","D5","D#5","E5","F5","F#5","G5",
      "G#5","A5","A#5","B5","C6","C#6","D6","D#6","E6","F6","F#6","G6"
    ],
  },
  {
    name: "Triangle",
    type: "triangle",
    pitchCount: 24,
    baseNote: "C2", // ← required
    notes: [
      "C2","C#2","D2","D#2","E2","F2","F#2","G2","G#2","A2","A#2","B2",
      "C3","C#3","D3","D#3","E3","F3","F#3","G3","G#3","A3","A#3","B3"
    ],
  },
  {
    name: "Pulse",
    type: "pulse",
    pitchCount: 24,
    baseNote: "C3", // ← required
    notes: [
      "C3","C#3","D3","D#3","E3","F3","F#3","G3","G#3","A3","A#3","B3",
      "C4","C#4","D4","D#4","E4","F4","F#4","G4","G#4","A4","A#4","B4"
    ],
  },
];

// --------------------
// Note helpers
// --------------------
function noteToMidiSafe(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(name).trim());
  if (!m) throw new Error(`Bad note: "${name}"`);
  const pc = (m[1] + (m[2] || "")).toUpperCase();
  const SEMI: Record<string, number> = {
    C:0,"C#":1,DB:1,D:2,"D#":3,EB:3,E:4,F:5,"F#":6,GB:6,G:7,"G#":8,AB:8,A:9,"A#":10,BB:10,B:11
  };
  if (SEMI[pc] == null) throw new Error(`Unknown pitch: "${pc}"`);
  const oct = parseInt(m[3], 10);
  return Math.max(0, Math.min(127, (oct + 1) * 12 + SEMI[pc]));
}

function nearestNoteInInstrument(targetMidi: number, notes: string[]) {
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < notes.length; i++) {
    const midi = noteToMidiSafe(notes[i]);
    const d = Math.abs(midi - targetMidi);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return { index: bestIdx, name: notes[bestIdx] };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const normMod = (n: number, m: number) => ((n % m) + m) % m;

/** -------------------- NEW: collect ALL notes + correct last end step -------------------- **/
// collect existing notes as absolute steps (0..steps-1)
function collectSeed(
  grid: boolean[][][],
  durationGrid: number[][][],
  steps: number,
  instruments: typeof INSTRUMENTS
) {
  const events: Array<{ step: number; instrumentIdx: number; note: string; length: number }> = [];
  let lastFilled = -1;

  for (let i = 0; i < grid.length; i++) {
    for (let p = 0; p < grid[i].length; p++) {
      for (let s = 0; s < steps; s++) {
        if (grid[i][p][s]) {
          const length = Math.max(1, durationGrid[i][p][s] || 1);
          events.push({
            step: s,
            instrumentIdx: i,
            note: instruments[i].notes[p],
            length,
          });
          // NEW: track the **end** of the note, not just the head
          lastFilled = Math.max(lastFilled, s + length - 1);
        }
      }
    }
  }
  return { events, lastFilled };
}

// --------------------
// Page
// --------------------
export default function Home() {
  const router = useRouter();

  // Steps + grids
  const [steps, setSteps] = useState<number>(64);
  const [grid, setGrid] = useState<boolean[][][]>(() =>
    INSTRUMENTS.map(inst =>
      Array.from({ length: inst.pitchCount }, () => Array(64).fill(false))
    )
  );
  const [durationGrid, setDurationGrid] = useState<number[][][]>(() =>
    INSTRUMENTS.map(inst =>
      Array.from({ length: inst.pitchCount }, () => Array(64).fill(1))
    )
  );

  // Tempo + volumes
  const [bpm, setBpm] = useState<number>(120);
  const [bpmInput, setBpmInput] = useState<string>("120");
  const [volumes, setVolumes] = useState<number[]>(
    Array.from({ length: INSTRUMENTS.length }, (_, i) => (i === 1 ? 80 : 70))
  );

  // RAG prompt
  const [gemPrompt, setGemPrompt] = useState<string>("");
  const [isComposing, setIsComposing] = useState<boolean>(false);

  // Hooks (audio + project)
  const {
    isPlaying,
    currentStep,
    isLoading,
    handlePlay,
    handleClear,
    playSound,
  } = useToneSequencer(INSTRUMENTS, grid, durationGrid, steps, bpm, volumes);

  const {
    projectName,
    showSaveModal,
    saveModalName,
    isSaving,
    handleSave,
    handleSaveAs,
    confirmSave,
    cancelSave,
    setSaveModalName,
    setCurrentProjectId,
    setProjectName,
  } = useProjectManager(grid, durationGrid, bpm);

  // ---------- Project load from URL ----------
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  useEffect(() => {
    const doLoad = async () => {
      const { projectId } = router.query;
      if (!projectId || typeof projectId !== "string") return;
      try {
        setIsLoadingProject(true);
        const p = await getProject(projectId);
        if (p) {
          setCurrentProjectId(p.id);
          setProjectName(p.name);
          if (p.grid_data && Array.isArray(p.grid_data)) {
            const loadedSteps = p.grid_data[0]?.[0]?.length || 64;
            setSteps(loadedSteps);
            setGrid(p.grid_data);
          }
          if (p.duration_data && Array.isArray(p.duration_data)) {
            setDurationGrid(p.duration_data);
          } else if (p.grid_data) {
            setDurationGrid(
              INSTRUMENTS.map((inst, iIdx) =>
                Array.from({ length: inst.pitchCount }, (_, pIdx) =>
                  Array(p.grid_data[iIdx]?.[pIdx]?.length || 64).fill(1)
                )
              )
            );
          }
          if (p.bpm) {
            setBpm(p.bpm);
            setBpmInput(String(p.bpm));
          }
        }
      } catch (e) {
        console.error("Load project failed:", e);
        alert("Failed to load project.");
      } finally {
        setIsLoadingProject(false);
      }
    };
    if (router.isReady) doLoad();
  }, [router.isReady, router.query, setCurrentProjectId, setProjectName]);

  // ---------- UI handlers ----------
  const handleVolumeChange = useCallback((instrumentIdx: number, newVolume: number) => {
    setVolumes(prev => {
      const copy = [...prev];
      copy[instrumentIdx] = newVolume;
      return copy;
    });
  }, []);

  const handleExportMidi = useCallback(() => {
    exportToMidi(INSTRUMENTS, grid, durationGrid, bpm, projectName || "Untitled_Project");
  }, [grid, durationGrid, bpm, projectName]);

  const handleNoteCreate = useCallback((
    instrumentIdx: number,
    pitchIdx: number,
    startStep: number,
    endStep: number
  ) => {
    const duration = Math.max(1, endStep - startStep + 1);

    setGrid(prev => {
      const copy = prev.map(inst => inst.map(row => row.slice()));
      // Place a note head on start, clear between start..end (only the head is active)
      for (let s = startStep; s <= endStep; s++) copy[instrumentIdx][pitchIdx][s] = false;
      copy[instrumentIdx][pitchIdx][startStep] = true;
      return copy;
    });

    setDurationGrid(prev => {
      const copy = prev.map(inst => inst.map(row => row.slice()));
      copy[instrumentIdx][pitchIdx][startStep] = duration;
      return copy;
    });

    const note = INSTRUMENTS[instrumentIdx].notes[pitchIdx];
    playSound(note, INSTRUMENTS[instrumentIdx].type);
  }, [playSound]);

  const handleNoteDelete = useCallback((instrumentIdx: number, pitchIdx: number, stepIdx: number) => {
    setGrid(prev => {
      const copy = prev.map(inst => inst.map(row => row.slice()));
      copy[instrumentIdx][pitchIdx][stepIdx] = false;
      return copy;
    });
    setDurationGrid(prev => {
      const copy = prev.map(inst => inst.map(row => row.slice()));
      copy[instrumentIdx][pitchIdx][stepIdx] = 1;
      return copy;
    });
  }, []);

  const handleClearGrid = useCallback(() => {
    if (handleClear()) {
      setGrid(
        INSTRUMENTS.map(inst =>
          Array.from({ length: inst.pitchCount }, () => Array(steps).fill(false))
        )
      );
      setDurationGrid(
        INSTRUMENTS.map(inst =>
          Array.from({ length: inst.pitchCount }, () => Array(steps).fill(1))
        )
      );
    }
  }, [handleClear, steps]);

  const handleBpmChange = useCallback((value: string) => {
    const onlyDigits = value.replace(/\D/g, "");
    setBpmInput(onlyDigits);
    if (onlyDigits) {
      const n = parseInt(onlyDigits, 10);
      if (!Number.isNaN(n) && n >= 20 && n <= 240) setBpm(n);
    }
  }, []);

  const handleBpmBlur = useCallback(() => {
    const n = Number(bpmInput);
    if (!bpmInput || Number.isNaN(n) || n < 20) {
      setBpm(60);
      setBpmInput("60");
    }
  }, [bpmInput]);

  const addSegment = useCallback(() => {
    if (steps >= MAX_STEPS) return;
    const newSteps = steps + 4;
    setSteps(newSteps);
    setGrid(prev =>
      prev.map(inst => inst.map(row => [...row, false, false, false, false]))
    );
    setDurationGrid(prev =>
      prev.map(inst => inst.map(row => [...row, 1, 1, 1, 1]))
    );
  }, [steps]);

  const removeSegment = useCallback(() => {
    if (steps <= MIN_STEPS) return;
    const newSteps = steps - 4;
    setSteps(newSteps);
    setGrid(prev => prev.map(inst => inst.map(row => row.slice(0, newSteps))));
    setDurationGrid(prev => prev.map(inst => inst.map(row => row.slice(0, newSteps))));
  }, [steps]);

  const toPitchIndex = useCallback((note: string, instrumentIdx: number) => {
    const allowed = INSTRUMENTS[instrumentIdx].notes;
    const midi = noteToMidiSafe(note);
    return nearestNoteInInstrument(midi, allowed).index;
  }, []);

  // -------------------- NEW: main compose handler (true continuation + uniform window) --------------------
  const composeWithRag = useCallback(async () => {
    setIsComposing(true);
    try {
      // 1) Gather ALL notes as seed and compute continuation point (after the last note's END)
      const seed = collectSeed(grid, durationGrid, steps, INSTRUMENTS); // NEW
      const computedStart = seed.lastFilled >= 0 ? seed.lastFilled + 1 : 0; // NEW

      // 2) Ask server to fill a clear window (3 bars) and keep it uniform
      const barSteps = 16;       // NEW: steps per bar
      const fillBars = 3;        // NEW: fill exactly 3 bars (change as you like)

      const r = await fetch("/api/gemini-compose-mdb", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: gemPrompt || "mega man boss energetic",          // plain English, no BPM
          instruments: INSTRUMENTS.map((ins) => ({ name: ins.name })), // API only needs names for the map
          steps,
          startStep: computedStart, // NEW: explicit start (server will also recompute from seed)
          barSteps,                 // NEW
          fillBars,                 // NEW
          fillUniform: true,        // NEW: tile motif if the model under-fills
          seed: { events: seed.events }, // NEW: send ALL user notes (server accepts 'step' or 'relStep')
          maxEvents: 160,                 // give room for a few bars of content
        }),
      });

      const txt = await r.text();
      if (!r.ok) throw new Error(`${r.status}: ${txt}`);

      const data = JSON.parse(txt) as {
        events: Array<{ relStep: number; instrumentIdx: number; note: string; length?: number }>;
        startStep?: number;  // NEW: server echoes the start it used
        endStep?: number;    // NEW: end of the enforced window
      };

      const serverStart = (data.startStep ?? computedStart) | 0; // NEW

      // 3) Place returned notes using the **server's** start offset (no overlaps with user heads)
      setGrid(prev => {
        const g = prev.map(inst => inst.map(row => row.slice()));
        setDurationGrid(prevDur => {
          const d = prevDur.map(inst => inst.map(row => row.slice()));

          for (const ev of data.events) {
            const i = clamp(ev.instrumentIdx | 0, 0, INSTRUMENTS.length - 1);
            const absStep = normMod(serverStart + clamp(ev.relStep | 0, 0, steps - 1), steps); // NEW
            const pitchIdx = toPitchIndex(ev.note, i);
            if (g[i][pitchIdx][absStep]) continue; // don't overwrite existing heads
            g[i][pitchIdx][absStep] = true;
            d[i][pitchIdx][absStep] = Math.max(1, (ev.length ?? 1) | 0);
          }

          return d;
        });
        return g;
      });
    } catch (e: any) {
      console.error("composeWithRag error:", e);
      alert("RAG autocomplete failed. See console.");
    } finally {
      setIsComposing(false);
    }
  }, [gemPrompt, grid, durationGrid, steps, toPitchIndex]);

  // (Optional) keep your older "compose from scratch" helper if you still use it elsewhere
  const ragCompose = useCallback(async () => {
    try {
      const instrumentsPayload = INSTRUMENTS.map(i => ({ name: i.name, notes: i.notes }));

      const r = await fetch("/api/gemini-compose-mdb", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: gemPrompt || "Compose a catchy 8-bit overworld theme that uses all three waves.",
          instruments: instrumentsPayload,
          maxEvents: 24,
        }),
      });

      const txt = await r.text();
      if (!r.ok) {
        console.error("gemini-compose-mdb failed", r.status, txt);
        alert(`Compose failed (${r.status}). See console.`);
        return;
      }

      const { events, startStep: serverStart = 0 } = JSON.parse(txt) as {
        events: Array<{ relStep: number; instrumentIdx: number; note: string; length?: number }>;
        startStep?: number;
      };

      setGrid(prev => {
        const g = prev.map(inst => inst.map(row => row.slice()));
        setDurationGrid(prevDur => {
          const d = prevDur.map(inst => inst.map(row => row.slice()));

          for (const ev of events) {
            const instIdx = clamp(ev.instrumentIdx | 0, 0, INSTRUMENTS.length - 1);
            const absStep = normMod(serverStart + clamp(ev.relStep | 0, 0, steps - 1), steps); // NEW
            const pitchIdx = toPitchIndex(ev.note, instIdx);
            g[instIdx][pitchIdx][absStep] = true;
            d[instIdx][pitchIdx][absStep] = Math.max(1, (ev.length ?? 1) | 0);
          }

          return d;
        });
        return g;
      });
    } catch (err) {
      console.error("ragCompose error:", err);
      alert("Failed to compose. See console.");
    }
  }, [gemPrompt, steps, toPitchIndex]);

  // Loading screen for project fetch
  if (isLoadingProject) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400 mb-4 animate-pulse">
            LOADING PROJECT...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <Header
        isSaving={isSaving}
        isPlaying={isPlaying}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExportMidi={handleExportMidi}
      />

      <div className="flex flex-col items-center justify-center p-8 gap-6">
        {/* Project name chip */}
        <div className="px-6 py-3 bg-gray-900 border-4 border-purple-500 shadow-[4px_4px_0_0_rgba(75,0,130,1)]">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-purple-400">PROJECT:</span>
            <span className="text-sm font-bold text-yellow-400">{projectName}</span>
          </div>
        </div>

        <ControlPanel
          isPlaying={isPlaying}
          isLoading={isLoading}
          bpmInput={bpmInput}
          steps={steps}
          onPlay={handlePlay}
          onClear={handleClearGrid}
          onBpmChange={handleBpmChange}
          onBpmBlur={handleBpmBlur}
          onAddSegment={addSegment}
          onRemoveSegment={removeSegment}
        />

        {/* AI Compose Section */}
        <div className="w-full max-w-4xl bg-gradient-to-r from-purple-900 to-pink-900 border-8 border-yellow-400 shadow-[8px_8px_0px_0px_rgba(255,215,0,1)] p-6 rounded-lg">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-2xl">🤖</div>
              <h2 className="text-2xl font-bold text-yellow-400 tracking-wider">AI MUSIC COMPOSER</h2>
              {isComposing && (
                <div className="flex items-center gap-2 ml-auto">
                  <div className="animate-spin h-5 w-5 border-4 border-yellow-400 border-t-transparent rounded-full"></div>
                  <span className="text-yellow-400 font-bold animate-pulse">AI GENERATING...</span>
                </div>
              )}
            </div>
            <p className="text-sm text-purple-200 mb-2">
              Start a melody and AI will continue your creation, or compose from scratch with full automation!
            </p>
            <div className="flex gap-3 items-stretch">
              <input
                value={gemPrompt}
                onChange={(e) => setGemPrompt(e.target.value)}
                placeholder='Try: "mega man boss energetic" or "castlevania dark castle"'
                className="flex-1 px-4 py-3 rounded-lg border-4 border-purple-600 bg-white text-black text-lg font-medium placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isComposing || isPlaying || isLoading}
              />
              <button
                onClick={composeWithRag}
                disabled={isPlaying || isLoading || isComposing}
                className="px-8 py-3 text-lg font-bold bg-yellow-400 hover:bg-yellow-500 text-black border-4 border-yellow-600 shadow-[4px_4px_0px_rgba(139,105,20,1)] disabled:opacity-50 disabled:cursor-not-allowed active:translate-x-1 active:translate-y-1 active:shadow-none transition-all rounded-lg whitespace-nowrap"
                title="Use AI to compose music across all instruments"
              >
                {isComposing ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin h-5 w-5 border-4 border-black border-t-transparent rounded-full"></div>
                    COMPOSING...
                  </span>
                ) : (
                  "✨ GENERATE MUSIC"
                )}
              </button>
            </div>
            {isComposing && (
              <div className="mt-2 p-3 bg-purple-800 border-2 border-yellow-400 rounded">
                <div className="flex items-center gap-2">
                  <div className="animate-pulse text-yellow-400 font-bold">●</div>
                  <p className="text-yellow-300 text-sm font-medium animate-pulse">
                    AI is analyzing your prompt and generating a unique melody...
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Single grid window */}
        <SequencerGrid
          instruments={INSTRUMENTS}
          grid={grid}
          durationGrid={durationGrid}
          currentStep={currentStep}
          steps={steps}
          volumes={volumes}
          onNoteCreate={handleNoteCreate}
          onNoteDelete={handleNoteDelete}
          onVolumeChange={handleVolumeChange}
          isPlaying={isPlaying}
        />
      </div>

      {/* Single SaveModal (no duplicates) */}
      <SaveModal
        isOpen={showSaveModal}
        projectName={saveModalName}
        isSaving={isSaving}
        onNameChange={setSaveModalName}
        onConfirm={confirmSave}
        onCancel={cancelSave}
      />
    </div>
  );
}
