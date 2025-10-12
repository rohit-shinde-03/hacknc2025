import { useState, useCallback, useEffect, useRef } from "react";
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
    pitchCount: 24,
    baseNote: "G#3", // ← required
    notes: [
      "G#3","A3","A#3","B3","C4","C#4","D4","D#4","E4","F4","F#4","G4",
      "G#4","A4","A#4","B4","C5","C#5","D5","D#5","E5","F5","F#5","G5"
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

  // --------------------
  // RAG compose: calls /api/gemini-compose-mdb and writes directly into grid
  // --------------------
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
          stepQuant: 16,
          maxPolyphony: 3,
        }),
      });

      const txt = await r.text();
      if (!r.ok) {
        console.error("gemini-compose-mdb failed", r.status, txt);
        alert(`Compose failed (${r.status}). See console.`);
        return;
      }

      const { events } = JSON.parse(txt) as {
        events: Array<{ relStep: number; instrumentIdx: number; note: string; length?: number }>;
      };

      // Simple insertion starting at step 0 (no optional preview, no second window)
      const startStep = 0;

      setGrid(prev => {
        const g = prev.map(inst => inst.map(row => row.slice()));
        setDurationGrid(prevDur => {
          const d = prevDur.map(inst => inst.map(row => row.slice()));

          for (const ev of events) {
            const instIdx = Math.max(0, Math.min(INSTRUMENTS.length - 1, ev.instrumentIdx | 0));
            const absStep = Math.min(steps - 1, Math.max(0, startStep + Math.max(0, ev.relStep | 0)));
            const { index: pitchIdx } = nearestNoteInInstrument(noteToMidiSafe(ev.note), INSTRUMENTS[instIdx].notes);

            // place head and duration
            g[instIdx][pitchIdx][absStep] = true;
            d[instIdx][pitchIdx][absStep] = Math.max(1, (ev.length ?? 1) | 0);
          }

          setDurationGrid(d);
          return d; // TS satisfied; value ignored by React in setter form
        });

        return g;
      });
    } catch (err) {
      console.error("ragCompose error:", err);
      alert("Failed to compose. See console.");
    }
  }, [gemPrompt, steps]);

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

        {/* RAG compose controls (single button) */}
        <div className="flex gap-2 items-stretch w-full max-w-3xl">
          <input
            value={gemPrompt}
            onChange={(e) => setGemPrompt(e.target.value)}
            placeholder='e.g. "overworld theme, bright, 8-bit"'
            className="flex-1 px-3 py-2 rounded border-2 border-slate-400 bg-white text-black"
          />
          <button
            onClick={ragCompose}
            disabled={isPlaying || isLoading}
            className="px-4 py-2 font-bold bg-rose-400 hover:bg-rose-500 text-black border-4 border-rose-700 shadow-[4px_4px_0_rgba(120,0,40,1)] disabled:opacity-50"
            title="RAG: Compose across all instruments"
          >
            Compose (RAG)
          </button>
        </div>
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
