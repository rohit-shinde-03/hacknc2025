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


// ===================
// Config & Instruments
// ===================
const STEPS = 64; // 64 time steps (16 groups of 4)

const INSTRUMENTS = [
  { 
    name: "Square", 
    type: "square", 
    pitchCount: 24, // 2 octaves
    baseNote: "G#3",
    notes: [
      "G#3", "A3", "A#3", "B3", "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4",
      "G#4", "A4", "A#4", "B4", "C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5"
    ]
  },
  { 
    name: "Triangle", 
    type: "triangle", 
    pitchCount: 24, // 2 octaves (bass)
    baseNote: "C2",
    notes: [
      "C2", "C#2", "D2", "D#2", "E2", "F2", "F#2", "G2", "G#2", "A2", "A#2", "B2",
      "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3"
    ]
  },
  { 
    name: "Pulse", 
    type: "pulse", 
    pitchCount: 24, // 2 octaves
    baseNote: "C3",
    notes: [
      "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
      "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"
    ]
  },
];

// ===================
// Local token helpers (self-contained)
// ===================
const PAD_ID = 0, REST_ID = 1, HOLD_ID = 2, PITCH_BASE = 3;

function noteToMidiSafe(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(name).trim());
  if (!m) throw new Error(`Bad note: "${name}"`);
  const pc = (m[1] + (m[2] || "")).toUpperCase();
  const SEMI: Record<string, number> = {
    C:0,"C#":1,DB:1,D:2,"D#":3,EB:3,E:4,F:5,"F#":6,GB:6,G:7,"G#":8,AB:8,A:9,"A#":10,BB:10,B:11
  };
  if (SEMI[pc] == null) throw new Error(`Unknown pitch class: "${pc}"`);
  const oct = parseInt(m[3], 10);
  return Math.max(0, Math.min(127, (oct + 1) * 12 + SEMI[pc]));
}

function buildLeadTokensFromGrid(
  grid: boolean[][][],
  instruments: { notes: string[] }[],
  steps: number
): number[] {
  const tokens: number[] = [];
  let prevMidi: number | null = null;

  for (let s = 0; s < steps; s++) {
    const active: number[] = [];
    for (let inst = 0; inst < grid.length; inst++) {
      const rows = grid[inst];
      for (let p = 0; p < rows.length; p++) {
        if (rows[p][s]) {
          const name = instruments[inst].notes[p];
          try {
            active.push(noteToMidiSafe(name));
          } catch (e) {
            console.warn("Bad note at inst/pitch", inst, p, name, e);
          }
        }
      }
    }
    if (active.length === 0) {
      tokens.push(prevMidi === null ? REST_ID : HOLD_ID);
      continue;
    }
    const midi = active.sort((a, b) => b - a)[0]; // highest pitch (skyline)
    if (prevMidi === null || midi !== prevMidi) {
      tokens.push(PITCH_BASE + midi);
      prevMidi = midi;
    } else {
      tokens.push(HOLD_ID);
    }
  }
  return tokens;
}

function nearestNoteInInstrument(targetMidi: number, notes: string[]) {
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < notes.length; i++) {
    const m = noteToMidiSafe(notes[i]);
    const d = Math.abs(m - targetMidi);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return { name: notes[bestIdx], index: bestIdx };
}

// Top-p sampler that works with number[] or typed arrays
function sampleTopP(
  logitsLike: ArrayLike<number>,
  topP = 0.90,
  temperature = 1.05
): number {
  const arr = Array.from(logitsLike as ArrayLike<number>);
  const t = Math.max(1e-8, temperature);

  const scaled = arr.map(v => v / t);
  const maxLogit = Math.max(...scaled);
  const exps = scaled.map(v => Math.exp(v - maxLogit));
  const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
  const probs = exps.map(v => v / sumExp);

  const ranked = probs.map((p, i) => ({ i, p })).sort((a, b) => b.p - a.p);
  let cum = 0;
  const kept: Array<{ i: number; p: number }> = [];
  for (const it of ranked) { kept.push(it); cum += it.p; if (cum >= topP) break; }
  const keptSum = kept.reduce((a, b) => a + b.p, 0) || 1;

  const r = Math.random();
  let acc = 0;
  for (const { i, p } of kept) {
    acc += p / keptSum;
    if (r <= acc) return i;
  }
  return kept[0]?.i ?? 0;
}

// ===================
// Page Component
// ===================
export default function Home() {
  const router = useRouter();

  const [steps, setSteps] = useState(64); // Start with 16 groups of 4
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const toneRef = useRef<any | null>(null);
  const synthsRef = useRef<any[]>([]);
  const sequenceRef = useRef<any>(null);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize 3D grid: [instrumentIndex][pitchIndex][stepIndex]
  const [grid, setGrid] = useState<boolean[][][]>(() =>
    INSTRUMENTS.map(instrument =>
      Array.from({ length: instrument.pitchCount }, () =>
        Array(steps).fill(false)
      )
    )
  );

  // Duration grid: stores how many steps each note lasts (1 = single step, 2+ = sustained)
  const [durationGrid, setDurationGrid] = useState<number[][][]>(() =>
    INSTRUMENTS.map(instrument =>
      Array.from({ length: instrument.pitchCount }, () =>
        Array(steps).fill(1)
      )
    )
  );

  const [bpm, setBpm] = useState(120);
  const [bpmInput, setBpmInput] = useState("120");
  
  // Volume state for each instrument (0-100)
  const [volumes, setVolumes] = useState<number[]>([70, 80, 70]); // Square, Triangle, Pulse

  // Use custom hooks for sequencer and project management
  const {
    isPlaying,
    currentStep,
    isLoading,
    playSound,
    handlePlay,
    handleClear,
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

  const handleVolumeChange = useCallback((instrumentIndex: number, newVolume: number) => {
    setVolumes(prevVolumes => {
      const newVolumes = [...prevVolumes];
      newVolumes[instrumentIndex] = newVolume;
      return newVolumes;
    });
  }, []);

  const handleExportMidi = useCallback(() => {
    exportToMidi(INSTRUMENTS, grid, durationGrid, bpm, projectName || "Untitled_Project");
  }, [grid, durationGrid, bpm, projectName]);

  // Load project from URL if projectId is provided
  useEffect(() => {
    const loadProject = async () => {
      const { projectId } = router.query;
      
      if (!projectId || typeof projectId !== 'string') {
        return;
      }

      try {
        setIsLoadingProject(true);
        console.log('Loading project with ID:', projectId);
        
        const project = await getProject(projectId);
        
        if (project) {
          console.log('Project loaded:', project);
          
          // Set project metadata
          setCurrentProjectId(project.id);
          setProjectName(project.name);
          
          // Load grid data
          if (project.grid_data && Array.isArray(project.grid_data)) {
            const loadedSteps = project.grid_data[0]?.[0]?.length || 64;
            setSteps(loadedSteps);
            setGrid(project.grid_data);
          }
          
          // Load duration data (with backward compatibility)
          if (project.duration_data && Array.isArray(project.duration_data)) {
            setDurationGrid(project.duration_data);
          } else {
            // Old project without duration data - default all to 1 step
            console.log('No duration_data found, defaulting to 1-step notes');
            setDurationGrid(
              INSTRUMENTS.map((instrument, iIdx) =>
                Array.from({ length: instrument.pitchCount }, (_, pIdx) =>
                  Array(project.grid_data[iIdx]?.[pIdx]?.length || 64).fill(1)
                )
              )
            );
          }
          
          // Load BPM
          if (project.bpm) {
            setBpm(project.bpm);
            setBpmInput(String(project.bpm));
          }
          
          console.log('Project loaded successfully');
        }
      } catch (error) {
        console.error('Error loading project:', error);
        alert('Failed to load project. Please try again.');
      } finally {
        setIsLoadingProject(false);
      }
    };

    if (router.isReady) {
      loadProject();
    }
  }, [router.isReady, router.query, setCurrentProjectId, setProjectName]);

  const handleNoteCreate = useCallback((
    instrumentIndex: number, 
    pitchIndex: number, 
    startStep: number, 
    endStep: number
  ) => {
    const duration = endStep - startStep + 1;
    
    setGrid((prevGrid) => {
      const newGrid = prevGrid.map((instrument, iIdx) =>
        instrument.map((pitch, pIdx) =>
          pitch.map((step, sIdx) => {
            if (iIdx === instrumentIndex && pIdx === pitchIndex) {
              // Activate start step, deactivate cells in between
              if (sIdx === startStep) return true;
              if (sIdx > startStep && sIdx <= endStep) return false;
            }
            return prevGrid[iIdx][pIdx][sIdx];
          })
        )
      );
      return newGrid;
    });

    setDurationGrid((prevDuration) => {
      const newDuration = prevDuration.map((instrument, iIdx) =>
        instrument.map((pitch, pIdx) =>
          pitch.map((step, sIdx) => {
            if (iIdx === instrumentIndex && pIdx === pitchIndex && sIdx === startStep) {
              return duration;
            }
            return prevDuration[iIdx][pIdx][sIdx];
          })
        )

  const [suggestion, setSuggestion] = useState<{
    instrumentIdx: number;
    pitchIdx: number;
    stepIdx: number;
    noteName: string;
  } | null>(null);
  // below existing refs/state:
  const [gemPrompt, setGemPrompt] = useState("");
  const runningSeqRef = useRef<{ cancel: () => void } | null>(null);
  const AUTO_COMMIT = true; // set false if you only want highlight preview

  // Project state
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [isSaveAs, setIsSaveAs] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ------- Audio helpers -------
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
        tempSynth = new ToneNS.Synth({ oscillator: { type: waveform } }).toDestination();
      } else {
        console.warn('Tone.Synth not found');
        return;
      }
    } catch (e) {
      console.warn('Error creating synth:', e);
      return;
    }

    try {
      tempSynth.triggerAttackRelease(note, "32n");
      setTimeout(() => {
        if (tempSynth && typeof tempSynth.dispose === 'function') tempSynth.dispose();
      }, 300);
    } catch (e) {
      console.warn('Error triggering sound:', e);
      if (tempSynth && typeof tempSynth.dispose === 'function') tempSynth.dispose();
    }
  }, []);

  const initializeSynths = useCallback(async () => {
    if (synthsRef.current.length > 0) return;
    try {
      const mod = await import("tone");
      const ns: any = mod as any;
      const DefaultNS: any = (ns && ns.default) ? ns.default : undefined;
      const GlobalNS: any = (globalThis as any).Tone ?? undefined;
      const ToneNS: any = (ns && (ns.start || ns.Synth)) ? ns
        : (DefaultNS && (DefaultNS.start || DefaultNS.Synth)) ? DefaultNS
        : GlobalNS;
      toneRef.current = ToneNS;

      for (let i = 0; i < INSTRUMENTS.length; i++) {
        const polySynth = new ToneNS.PolySynth(ToneNS.Synth, {
          oscillator: { type: INSTRUMENTS[i].type as any }
        }).toDestination();
        synthsRef.current.push(polySynth);
      }
    } catch (e) {
      console.error('Error initializing synths:', e);
    }
  }, []);

  // ------- Transport -------
  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      setSuggestion(null);
      if (suggestTimerRef.current) {                // NEW
        clearTimeout(suggestTimerRef.current);
        suggestTimerRef.current = null;
      }
      const Tone: any = toneRef.current;
      if (sequenceRef.current) {
        try {
          sequenceRef.current.stop("+0.1");
          sequenceRef.current.dispose();
        } catch (e) {
          console.warn('Error stopping sequence:', e);
        }
        sequenceRef.current = null;
      }
      if (Tone?.Transport) {
        try {
          Tone.Transport.stop("+0.1");
          Tone.Transport.cancel();
        } catch (e) {
          console.warn('Error stopping transport:', e);
        }
      }
      setIsPlaying(false);
      setCurrentStep(-1);
      return;
    }

    setIsLoading(true);
    setSuggestion(null); // NEW
    if (suggestTimerRef.current) {                  // NEW
      clearTimeout(suggestTimerRef.current);
      suggestTimerRef.current = null;
    }
    await initializeSynths();

    try {
      const Tone: any = toneRef.current;
      if (!Tone) { setIsLoading(false); return; }
      if (typeof Tone.start === 'function') await Tone.start();

      Tone.Transport.bpm.value = bpm;

      sequenceRef.current = new Tone.Sequence(
        (time: number, step: number) => {
          Tone.Draw.schedule(() => { setCurrentStep(step); }, time);
          grid.forEach((instrument, instrumentIndex) => {
            instrument.forEach((pitchRow, pitchIndex) => {
              if (pitchRow[step]) {
                const note = INSTRUMENTS[instrumentIndex].notes[pitchIndex];
                synthsRef.current[instrumentIndex].triggerAttackRelease(note, "16n", time);
              }
            });
          });
        },
        Array.from({ length: STEPS }, (_, i) => i),
        "16n"
      );
      return newDuration;
    });


    // Play sound
    const note = INSTRUMENTS[instrumentIndex].notes[pitchIndex];
    const waveform = INSTRUMENTS[instrumentIndex].type;
    playSound(note, waveform);
  }, [playSound]);

  const handleNoteDelete = useCallback((instrumentIndex: number, pitchIndex: number, stepIndex: number) => {
      if (sequenceRef.current.loop !== undefined) sequenceRef.current.loop = true;
      sequenceRef.current.start(0);
      Tone.Transport.start();
      setIsPlaying(true);
    } catch (e) {
      console.warn('Error starting playback:', e);
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, grid, initializeSynths, bpm]);

  // ------- Grid interactions -------
  const handleToggle = useCallback((instrumentIndex: number, pitchIndex: number, stepIndex: number) => {
    setGrid((prevGrid) => {
      const newGrid = prevGrid.map((instrument, iIdx) =>
        instrument.map((pitch, pIdx) =>
          pitch.map((step, sIdx) =>
            iIdx === instrumentIndex && pIdx === pitchIndex && sIdx === stepIndex
              ? false
              : prevGrid[iIdx][pIdx][sIdx]
          )
        )
      );
      return newGrid;
    });

    setDurationGrid((prevDuration) => {
      const newDuration = prevDuration.map((instrument, iIdx) =>
        instrument.map((pitch, pIdx) =>
          pitch.map((step, sIdx) =>
            iIdx === instrumentIndex && pIdx === pitchIndex && sIdx === stepIndex
              ? 1
              : prevDuration[iIdx][pIdx][sIdx]
          )
        )
      );
      return newDuration;
    });
  }, []);

  const handleClearGrid = useCallback(() => {
    if (handleClear()) {
      setGrid(
        INSTRUMENTS.map(instrument =>
          Array.from({ length: instrument.pitchCount }, () =>
            Array(steps).fill(false)
          )
        )
      );
      setDurationGrid(
        INSTRUMENTS.map(instrument =>
          Array.from({ length: instrument.pitchCount }, () =>
            Array(steps).fill(1)
          )
        )
      );
    }
  }, [handleClear, steps]);

  const handleBpmChange = useCallback((value: string) => {
    const numericValue = value.replace(/\D/g, "");
    setBpmInput(numericValue);

    if (numericValue) {
      const numValue = parseInt(numericValue, 10);
      if (!isNaN(numValue) && numValue >= 20) {
        setBpm(numValue);
      }
      const wasActive = newGrid[instrumentIndex][pitchIndex][stepIndex];
      newGrid[instrumentIndex][pitchIndex][stepIndex] = !wasActive;

      // Accept/clear suggestion if user clicked the suggested cell
      if (suggestion &&
          suggestion.instrumentIdx === instrumentIndex &&
          suggestion.pitchIdx === pitchIndex &&
          suggestion.stepIdx === stepIndex) {
        setSuggestion(null);
      }

      if (!wasActive) {
        const note = INSTRUMENTS[instrumentIndex].notes[pitchIndex];
        const waveform = INSTRUMENTS[instrumentIndex].type;
        playSound(note, waveform);
      }

      return newGrid;
    });
  }, [playSound, suggestion]);


  const handleClear = useCallback(() => {
    setSuggestion(null); // NEW
    if (suggestTimerRef.current) {                 // NEW
    clearTimeout(suggestTimerRef.current);
    suggestTimerRef.current = null;
    }
    setGrid(INSTRUMENTS.map(instrument =>
      Array.from({ length: instrument.pitchCount }, () =>
        Array(STEPS).fill(false)
      )
    ));
  }, []);


  // ------- BPM -------
  const handleBpmChange = useCallback((value: string) => {
    if (value === "") { setBpmInput(""); return; }
    const numValue = Number(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 240) {
      setBpmInput(value);
      if (numValue >= 20) setBpm(numValue);
    }
  }, []);

  const handleBpmBlur = useCallback(() => {
    if (!bpmInput || parseInt(bpmInput, 10) < 20) {
    if (bpmInput === "" || Number(bpmInput) < 20) {
      setBpm(60);
      setBpmInput("60");
    }
  }, [bpmInput]);

  const addSegment = useCallback(() => {
    if (steps >= MAX_STEPS) return;
    
    const newSteps = steps + 4;
    setSteps(newSteps);
    
    // Extend the grid with 4 new empty columns
    setGrid(prevGrid =>
      prevGrid.map(instrument =>
        instrument.map(pitchRow =>
          [...pitchRow, false, false, false, false]
        )
      )
    );
    
    // Extend duration grid with default duration of 1
    setDurationGrid(prevDuration =>
      prevDuration.map(instrument =>
        instrument.map(pitchRow =>
          [...pitchRow, 1, 1, 1, 1]
        )
      )
    );
  }, [steps]);

  const removeSegment = useCallback(() => {
    if (steps <= MIN_STEPS) return;
    
    const newSteps = steps - 4;
    setSteps(newSteps);
    
    // Remove the last 4 columns from the grid
    setGrid(prevGrid =>
      prevGrid.map(instrument =>
        instrument.map(pitchRow =>
          pitchRow.slice(0, newSteps)
        )
      )
    );
    
    // Remove the last 4 columns from duration grid
    setDurationGrid(prevDuration =>
      prevDuration.map(instrument =>
        instrument.map(pitchRow =>
          pitchRow.slice(0, newSteps)
        )
      )
    );
  }, [steps]);

  // Show loading screen while project is being loaded
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
  // ------- Save / Load -------
  const handleSave = useCallback(async () => {
    if (currentProjectId) {
      setIsSaving(true);
      try {
        await updateProject(currentProjectId, { name: projectName, grid_data: grid, bpm });
        alert("Project saved successfully!");
      } catch (error) {
        console.error("Error saving project:", error);
        alert("Failed to save project. Please try again.");
      } finally {
        setIsSaving(false);
      }
    } else {
      setSaveModalName(projectName);
      setIsSaveAs(false);
      setShowSaveModal(true);
    }
  }, [currentProjectId, projectName, grid, bpm]);

  const handleSaveAs = useCallback(() => {
    setSaveModalName(projectName + " (Copy)");
    setIsSaveAs(true);
    setShowSaveModal(true);
  }, [projectName]);

  const handleSaveModalSubmit = useCallback(async () => {
    if (!saveModalName.trim()) { alert("Please enter a project name"); return; }
    setIsSaving(true);
    try {
      if (isSaveAs || !currentProjectId) {
        const newProject = await createProject({ name: saveModalName.trim(), grid_data: grid, bpm });
        setCurrentProjectId(newProject.id);
        setProjectName(newProject.name);
        router.push(`/?projectId=${newProject.id}`, undefined, { shallow: true });
        alert("Project created successfully!");
      }
      setShowSaveModal(false);
      setSaveModalName("");
    } catch (error) {
      console.error("Error saving project:", error);
      alert("Failed to save project. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [saveModalName, isSaveAs, currentProjectId, grid, bpm, router]);

// compute where to place the suggestion
const computeNextStep = useCallback((instrumentIdx: number) => {
  // If playing, advance from the transport's current step
  if (currentStep >= 0) return (currentStep + 1) % STEPS;

  // If stopped, use the first empty step after the last filled one
  let lastFilled = -1;
  const rows = grid[instrumentIdx];
  for (let s = 0; s < STEPS; s++) {
    for (let p = 0; p < rows.length; p++) {
      if (rows[p][s]) { lastFilled = Math.max(lastFilled, s); break; }
    }
  }
  return Math.min(STEPS - 1, (lastFilled >= 0 ? lastFilled + 1 : 0));
}, [currentStep, grid]);
// Turn a planned sequence into timed highlights (and optionally commit to grid)
const runSuggestionSequence = useCallback((
  items: Array<{ instrumentIdx: number; pitchIdx: number; stepIdx: number; noteName: string; ms?: number }>
) => {
  // cancel previous
  if (runningSeqRef.current) { runningSeqRef.current.cancel(); }
  let cancelled = false;

  runningSeqRef.current = {
    cancel: () => {
      cancelled = true;
      setSuggestion(null);
      if (suggestTimerRef.current) { clearTimeout(suggestTimerRef.current); suggestTimerRef.current = null; }
    }
  };

  const tick = (i: number) => {
    if (cancelled || i >= items.length) { setSuggestion(null); return; }
    const it = items[i];
    const dur = Math.max(80, it.ms ?? 1000); // default 1s highlight per your request

    // show halo
    setSuggestion({ instrumentIdx: it.instrumentIdx, pitchIdx: it.pitchIdx, stepIdx: it.stepIdx, noteName: it.noteName });

    // optionally place + preview sound
    if (AUTO_COMMIT) {
      setGrid(prev => {
        const copy = prev.map(inst => inst.map(row => row.slice()));
        copy[it.instrumentIdx][it.pitchIdx][it.stepIdx] = true;
        return copy;
      });
      // optional audio preview
      // playSound(it.noteName, INSTRUMENTS[it.instrumentIdx].type);
    }

    // clear halo after 1s, then move to next
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    suggestTimerRef.current = setTimeout(() => {
      setSuggestion(null);
      setTimeout(() => tick(i + 1), 30); // tiny gap
    }, dur);
  };

  tick(0);
}, [setGrid, setSuggestion, AUTO_COMMIT]);

  // Load project from URL
  useEffect(() => {
    const loadProject = async () => {
      const { projectId } = router.query;
      if (projectId && typeof projectId === "string") {
        try {
          const project = await getProject(projectId);
          if (project) {
            setGrid(project.grid_data);
            setBpm(project.bpm);
            setBpmInput(String(project.bpm));
            setProjectName(project.name);
            setCurrentProjectId(project.id);
          }
        } catch (error) {
          console.error("Error loading project:", error);
          alert("Failed to load project");
        }
      }
    };
    if (router.isReady) loadProject();
  }, [router.isReady, router.query]);

  useEffect(() => { setBpmInput(String(bpm)); }, [bpm]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // NEW: clear AI suggestion timer + highlight
      if (suggestTimerRef.current) {
        clearTimeout(suggestTimerRef.current);
        suggestTimerRef.current = null;
      }
      setSuggestion(null);

      // existing audio cleanups
      const Tone: any = toneRef.current;
      if (Tone?.Transport) { Tone.Transport.stop(); Tone.Transport.cancel(); }
      if (sequenceRef.current) { sequenceRef.current.stop(); sequenceRef.current.dispose(); }
      synthsRef.current.forEach(synth => { if (synth && typeof synth.dispose === 'function') synth.dispose(); });
    };
  }, []);


  // ------- AI: Suggest Next Note -------
  const suggestNextNote = useCallback(async () => {
    try {
      // 1) Encode locally (skyline -> tokens)
      const tokens = buildLeadTokensFromGrid(
        grid,
        INSTRUMENTS.map(x => ({ notes: x.notes })),
        STEPS
      );

      // 2) Sanitize context (last 128) -> finite integers only
      const rawCtx = tokens.slice(-128);
      const ctx = rawCtx
        .filter((v) => Number.isFinite(v as number))
        .map((v) => Math.trunc(v as number));

      if (ctx.length === 0) {
        console.warn("Context empty. Last tokens:", tokens.slice(-32));
        alert("No valid context tokens yet. Toggle a few notes first.");
        return;
      }

      console.log("[AI] sending ctx head:", ctx.slice(0, 16), "len=", ctx.length);

      // 3) Call Next.js API (proxy to Python GPU server)
      const r = await fetch("/api/predict-next-note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input_ids: ctx }),
      });

      const raw = await r.text();
      if (!r.ok) {
        console.error("predict-next-note failed", r.status, raw);
        alert(`Predict failed (${r.status}). See console.`);
        return;
      }

      // 4) Parse + verify logits
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.logits) || typeof data.logits[0] !== "number") {
        console.error("API response missing/invalid logits:", data);
        alert("Predict response missing logits. See console.");
        return;
      }
      const logits: number[] = data.logits.slice();

      // 5) FORCE pitch-only decoding (mask PAD/REST/HOLD completely)
      if (logits.length >= PITCH_BASE + 128) {
        logits[0] = logits[1] = logits[2] = -1e9;
      }

      // 6) Sample a pitch id
      let nextId = sampleTopP(logits, 0.90, 1.05);
      if (nextId < PITCH_BASE) {
        // Fallback: greedy among pitches if sampling somehow hit a masked token
        let best = -Infinity, bestId = PITCH_BASE;
        for (let i = PITCH_BASE; i < Math.min(PITCH_BASE + 128, logits.length); i++) {
          if (logits[i] > best) { best = logits[i]; bestId = i; }
        }
        nextId = bestId;
      }
      let pitchMidi = nextId - PITCH_BASE; // 0..127 MIDI
      pitchMidi = Math.max(0, Math.min(127, pitchMidi));

      // 7) Decide instrument & step, then TEMPORARILY HIGHLIGHT (50ms)
      const instrumentIdx = 0; // Square (change if you want another track)
      const { name: noteName, index: pitchIdx } =
        nearestNoteInInstrument(pitchMidi, INSTRUMENTS[instrumentIdx].notes);

      // ✅ smarter next-step selection (fixes “always 2nd column”)
      const nextStep = computeNextStep(instrumentIdx);

      // Set suggestion highlight (UI will glow this cell)
      // Set suggestion highlight (UI glow)
      setSuggestion({ instrumentIdx, pitchIdx, stepIdx: nextStep, noteName });

      // Auto-clear after 50 ms
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
      suggestTimerRef.current = setTimeout(() => {
        setSuggestion(null);
        suggestTimerRef.current = null;
      }, 1000);

      // Do NOT setGrid here—no auto-placement
      // Optional: preview sound
      // playSound(noteName, INSTRUMENTS[instrumentIdx].type);


      // Optional: instant audio preview
      // playSound(noteName, INSTRUMENTS[instrumentIdx].type);
      console.log("[AI] nextId:", nextId, "MIDI:", pitchMidi, "snapped:", noteName, "-> idx", pitchIdx);

    } catch (err) {
      console.error("suggestNextNote error:", err);
      alert("Failed to get suggestion. See console.");
    }
  }, [grid, currentStep]);
  // Put near your other callbacks in src/pages/index.tsx

  const askGeminiAllWaves = useCallback(async () => {
    try {
      const startStep = 0; // or computeNextStep(0) if you want to start after the current content
      const instrumentsPayload = INSTRUMENTS.map(i => ({ name: i.name, notes: i.notes }));

      const r = await fetch("/api/gemini-melody", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: gemPrompt || "Compose a catchy chiptune overworld theme that uses all three waves.",
          instruments: instrumentsPayload,
          maxEvents: 24,
          stepQuant: 16,
          maxPolyphony: 3,
        }),
      });

      const raw = await r.text();
      if (!r.ok) {
        console.error("gemini-melody failed", r.status, raw);
        alert(`Gemini failed (${r.status}). See console.`);
        return;
      }

      const { events } = JSON.parse(raw) as {
        events: Array<{ relStep: number; instrumentIdx: number; note: string; length: number }>
      };

      // Build a sequential plan (one-by-one, 1s each)
      const plan: Array<{ instrumentIdx: number; pitchIdx: number; stepIdx: number; noteName: string; ms?: number }> = [];
      for (const ev of events) {
        const absStep = Math.min(STEPS - 1, (startStep + Math.max(0, ev.relStep)) % STEPS);
        const allowed = INSTRUMENTS[ev.instrumentIdx].notes;

        // snap to nearest available pitch on that instrument
        const targetMidi = noteToMidiSafe(ev.note);
        const { name, index } = nearestNoteInInstrument(targetMidi, allowed);

        plan.push({
          instrumentIdx: ev.instrumentIdx,
          pitchIdx: index,
          stepIdx: absStep,
          noteName: name,
          ms: 1000, // 1s highlight per your current preference
        });
      }

      // Option A: sequential (one-by-one)
      runSuggestionSequence(plan);

      // Option B (optional): group by step so all instruments in the same column flash together
      // -> If you want this, I can give you a runSuggestionGroups(plan) helper.

    } catch (err) {
      console.error("askGeminiAllWaves error:", err);
      alert("Failed asking Gemini. See console.");
    }
    }, [gemPrompt, /* computeNextStep, */ runSuggestionSequence]);

  const askGeminiAndAnimate = useCallback(async () => {
  try {
    const instrumentIdx = 0; // Square track as your lead
    const allowed = INSTRUMENTS[instrumentIdx].notes;
    const startStep = computeNextStep(instrumentIdx);

    const r = await fetch("/api/gemini-melody", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: gemPrompt || "Compose a catchy 8-bit overworld theme, upbeat, not a copy.",
        instrumentNotes: allowed,
        maxNotes: 16,
        stepQuant: 16,
      }),
    });

    const raw = await r.text();
    if (!r.ok) {
      console.error("gemini-melody failed", r.status, raw);
      alert(`Gemini failed (${r.status}). See console.`);
      return;
    }
    const { notes } = JSON.parse(raw) as { notes: Array<{ relStep: number; note: string; length?: number }> };

    // Convert to absolute steps + snap notes to nearest available row
    const plan: Array<{ instrumentIdx: number; pitchIdx: number; stepIdx: number; noteName: string; ms?: number }> = [];
    for (const n of notes) {
      const absStep = Math.min(STEPS - 1, (startStep + Math.max(0, n.relStep)) % STEPS);
      // snap to nearest row on this instrument
      const { name, index } = nearestNoteInInstrument(noteToMidiSafe(n.note), allowed);
      plan.push({ instrumentIdx, pitchIdx: index, stepIdx: absStep, noteName: name, ms: 1000 });
    }

    // sort by step to ensure left->right animation (in case model didn’t)
    plan.sort((a, b) => a.stepIdx - b.stepIdx);

    // run!
    runSuggestionSequence(plan);
  } catch (err) {
    console.error("askGeminiAndAnimate error:", err);
    alert("Failed asking Gemini. See console.");
  }
}, [gemPrompt, computeNextStep, runSuggestionSequence]);


  // ===================
  // Render
  // ===================
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
        {/* Project Name Display */}
        <div className="px-6 py-3 bg-gray-900 border-4 border-purple-500 shadow-[4px_4px_0px_0px_rgba(75,0,130,1)]">
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
        <div className="text-2xl font-bold text-slate-800">
          {projectName}
          {currentProjectId && <span className="ml-2 text-sm text-slate-500">(Saved)</span>}
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <button
            onClick={handlePlay}
            disabled={isLoading}
            className={`px-8 py-3 text-sm font-bold border-4 transition-all focus:outline-none ${
              isPlaying
                ? 'bg-red-500 hover:bg-red-600 text-white border-red-700 shadow-[4px_4px_0px_0px_rgba(127,0,0,1)]'
                : 'bg-green-400 hover:bg-green-500 text-black border-green-600 shadow-[4px_4px_0px_0px_rgba(0,100,0,1)]'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'active:translate-x-1 active:translate-y-1 active:shadow-none'}`}
          >
            {isLoading ? 'LOADING...' : isPlaying ? 'STOP' : 'PLAY'}
          </button>

          <button
            onClick={handleClear}
            disabled={isLoading || isPlaying}
            className="px-8 py-3 text-sm font-bold bg-purple-500 hover:bg-purple-600 text-white border-4 border-purple-700 shadow-[4px_4px_0px_0px_rgba(75,0,130,1)] transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            CLEAR
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || isPlaying}
            className="px-8 py-3 text-lg font-semibold rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          <button
            onClick={handleSaveAs}
            disabled={isSaving || isPlaying}
            className="px-6 py-3 text-lg font-semibold rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save As
          </button>

          {/* NEW: AI button */}
          <button
            onClick={suggestNextNote}
            disabled={isLoading || isPlaying}
            className="px-6 py-3 text-sm font-bold bg-yellow-300 hover:bg-yellow-400 text-black border-4 border-yellow-600 shadow-[4px_4px_0px_0px_rgba(139,69,0,1)] transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed active:translate-x-1 active:translate-y-1 active:shadow-none"
            title="Ask the AI to place the next note"
          >
            AI Suggest Next Note
          </button>
          {/* Gemini prompt */}
          <div className="flex gap-2 items-stretch w-full max-w-3xl">
            <input
              value={gemPrompt}
              onChange={(e) => setGemPrompt(e.target.value)}
              placeholder='e.g. "create a melody like super mario bros main theme overworld"'
              className="flex-1 px-3 py-2 rounded border-2 border-slate-400 bg-white text-black"
            />
          <button
            onClick={askGeminiAllWaves}
            disabled={isPlaying || isLoading}
            className="px-4 py-2 font-bold bg-rose-400 hover:bg-rose-500 text-black border-4 border-rose-700 shadow-[4px_4px_0px_rgba(120,0,40,1)] disabled:opacity-50"
            title="Gemini composes across Square, Triangle, and Pulse"
          >
            Gemini: Compose (All Waves)
          </button>
            {runningSeqRef.current && (
              <button
                onClick={() => { runningSeqRef.current?.cancel(); }}
                className="px-3 py-2 font-bold bg-slate-300 hover:bg-slate-400 text-black border-4 border-slate-600 shadow-[4px_4px_0px_rgba(60,60,60,1)]"
                title="Cancel the running highlight sequence"
              >
                Cancel
              </button>
            )}
          </div>


          {/* BPM Control */}
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-400 border-4 border-yellow-600 shadow-[4px_4px_0px_0px_rgba(139,69,0,1)]">
            <label htmlFor="bpm" className="text-xs font-bold text-black">BPM:</label>
            <input
              id="bpm"
              type="text"
              inputMode="numeric"
              value={bpmInput}
              onChange={(e) => handleBpmChange(e.target.value)}
              onBlur={handleBpmBlur}
              disabled={isPlaying}
              className="w-16 px-2 py-1 text-center text-black font-bold bg-white border-2 border-black focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="60"
            />
          </div>
        </div>

        <div className="w-full max-w-6xl overflow-x-auto overflow-y-visible border-4 border-cyan-400 shadow-[8px_8px_0px_0px_rgba(0,139,139,1)] bg-gray-900">
          <div className="space-y-4 p-4 min-w-max">
            {INSTRUMENTS.map((instrument, instrumentIndex) => (
              <div key={instrumentIndex} className="flex flex-col gap-2">
                {/* Instrument Label */}
                <div className="px-3 py-1 text-[10px] font-bold text-black bg-cyan-400 border-2 border-cyan-600 text-center sticky left-4 z-30 shadow-md w-fit">
                  {instrument.name.toUpperCase()}
                </div>

                <div className="flex items-start gap-2">
                  {/* Note Labels */}
                  <div className="flex flex-col sticky left-4 z-30 bg-gray-900 shadow-sm overflow-hidden pl-0">
                    <div className="h-4 mb-1"></div>
                    <div className="flex flex-col-reverse">
                      {grid[instrumentIndex].map((_, pitchIndex) => {
                        const noteName = instrument.notes[pitchIndex];
                        const isSharp = noteName.includes('#');
                        return (
                          <div key={pitchIndex} className={`h-6 pr-1 text-[8px] font-bold flex items-center justify-end w-10 ${
                            isSharp ? 'text-cyan-300' : 'text-green-400'
                          }`}>
                            {noteName}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Piano Roll */}
                  <div className="flex flex-col">
                    {/* Column Numbers */}
                    <div className="flex mb-1 h-4">
                      {Array.from({ length: STEPS }).map((_, stepIndex) => {
                        const isGroupStart = stepIndex % 4 === 0;
                        const groupNumber = Math.floor(stepIndex / 4) + 1;
                        return (
                          <div
                            key={stepIndex}
                            className="w-10 text-[10px] text-center font-bold text-yellow-400 flex items-center justify-center"
                          >
                            {isGroupStart ? groupNumber : ''}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-col-reverse border-4 border-cyan-400 overflow-visible min-w-max shadow-[4px_4px_0px_0px_rgba(0,139,139,1)]">
                      {grid[instrumentIndex].map((pitchRow, pitchIndex) => {
                        const noteName = instrument.notes[pitchIndex];
                        const isSharpRow = noteName.includes('#');
                        return (
                          <div key={pitchIndex} className="flex">
                            {pitchRow.map((isActive, stepIndex) => {
                              const isGroupStart = stepIndex > 0 && stepIndex % 4 === 0;
                              const needsHorizontalBorder = pitchIndex > 0;
                              const isCurrentColumn = currentStep === stepIndex;
                            const isSuggested = !!suggestion &&
                              suggestion.instrumentIdx === instrumentIndex &&
                              suggestion.pitchIdx === pitchIndex &&
                              suggestion.stepIdx === stepIndex;

                            return (
                              <button
                                key={stepIndex}
                                onClick={() => handleToggle(instrumentIndex, pitchIndex, stepIndex)}
                                title={isSuggested ? `AI: ${suggestion!.noteName}` : undefined}
                                className={`w-10 h-6 transition-all relative border border-gray-400 hover:ring-2 hover:ring-cyan-400 hover:ring-inset
                                  ${needsHorizontalBorder ? 'border-b border-b-gray-400' : ''}
                                  ${isGroupStart ? 'border-l-2 border-l-cyan-400 z-10' : 'border-l border-l-gray-400'}
                                  ${isCurrentColumn ? 'ring-2 ring-yellow-300 ring-inset !z-20 animate-pulse' : ''}
                                  ${isSuggested ? 'outline outline-4 outline-pink-400 outline-offset-2 z-30 animate-bounce' : ''}
                                  ${
                                    isActive
                                      ? 'bg-green-400 hover:bg-green-500'
                                      : isSharpRow
                                        ? 'bg-gray-700 hover:bg-gray-600'
                                        : 'bg-gray-800 hover:bg-gray-700'
                                  }`}
                                aria-pressed={isActive}
                              />
                            );

                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save Modal */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold mb-4 text-slate-800">
                {isSaveAs ? "Save As New Project" : "Save Project"}
              </h2>
              <input
                type="text"
                value={saveModalName}
                onChange={(e) => setSaveModalName(e.target.value)}
                placeholder="Enter project name"
                className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveModalSubmit();
                  } else if (e.key === "Escape") {
                    setShowSaveModal(false);
                  }
                }}
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowSaveModal(false)}
                  disabled={isSaving}
                  className="px-4 py-2 text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveModalSubmit}
                  disabled={isSaving}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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
