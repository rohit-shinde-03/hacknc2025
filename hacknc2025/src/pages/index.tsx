import { useCallback, useRef, useState, useEffect } from "react";
import { useRouter } from "next/router";
import Block from "@/components/Block";
import Header from "@/components/Header";
import { createProject, updateProject, getProject } from "../../utils/projects";
import type { Project } from "@/types/project";

const STEPS = 64; // 64 time steps (16 groups of 4)

// Instrument configuration: each instrument has multiple pitch rows
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
    baseNote: "C1",
    notes: [
      "C1", "C#1", "D1", "D#1", "E1", "F1", "F#1", "G1", "G#1", "A1", "A#1", "B1",
      "C2", "C#2", "D2", "D#2", "E2", "F2", "F#2", "G2", "G#2", "A2", "A#2", "B2"
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

export default function Home() {
  const router = useRouter();
  const toneRef = useRef<any | null>(null);
  const synthsRef = useRef<any[]>([]);
  const sequenceRef = useRef<any>(null);

  // Initialize 3D grid: [instrumentIndex][pitchIndex][stepIndex]
  // Each instrument has multiple pitch rows, each with STEPS time columns
  const [grid, setGrid] = useState<boolean[][][]>(() =>
    INSTRUMENTS.map(instrument =>
      Array.from({ length: instrument.pitchCount }, () =>
        Array(STEPS).fill(false)
      )
    )
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [bpmInput, setBpmInput] = useState("120");

  // Project state
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [isSaveAs, setIsSaveAs] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      tempSynth.triggerAttackRelease(note, "32n");
      // Dispose after sound finishes (32n = 32nd note, very short)
      setTimeout(() => {
        if (tempSynth && typeof tempSynth.dispose === 'function') {
          tempSynth.dispose();
        }
      }, 300);
    } catch (e) {
      console.warn('Error triggering sound:', e);
      if (tempSynth && typeof tempSynth.dispose === 'function') {
        tempSynth.dispose();
      }
    }
  }, []);

  // Initialize synths for playback
  const initializeSynths = useCallback(async () => {
    if (synthsRef.current.length > 0) return;
    
    try {
      // Load Tone dynamically with fallbacks (same as playSound)
      const mod = await import("tone");
      const ns: any = mod as any;
      const DefaultNS: any = (ns && ns.default) ? ns.default : undefined;
      const GlobalNS: any = (globalThis as any).Tone ?? undefined;

      // Prefer ESM named exports, then default namespace, then global UMD namespace
      const ToneNS: any = (ns && (ns.start || ns.Synth)) ? ns
        : (DefaultNS && (DefaultNS.start || DefaultNS.Synth)) ? DefaultNS
        : GlobalNS;
      
      console.log('Tone loaded successfully');
      
      // Store reference 
      toneRef.current = ToneNS;
      
      // Create one PolySynth per instrument (polyphonic = can play multiple notes at once)
      for (let i = 0; i < INSTRUMENTS.length; i++) {
        const polySynth = new ToneNS.PolySynth(ToneNS.Synth, {
          oscillator: { type: INSTRUMENTS[i].type as any }
        }).toDestination();
        synthsRef.current.push(polySynth);
      }
      console.log('PolySynths initialized:', synthsRef.current.length);
    } catch (e) {
      console.error('Error initializing synths:', e);
    }
  }, []);

  const handlePlay = useCallback(async () => {
    console.log('handlePlay called, isPlaying:', isPlaying);

    if (isPlaying) {
      // Stop playback
      console.log('Stopping playback');
      const Tone: any = toneRef.current;
      
      // Stop sequence first to avoid timing errors
      if (sequenceRef.current) {
        try {
          sequenceRef.current.stop("+0.1"); // Stop slightly in the future to avoid negative timing
          sequenceRef.current.dispose();
        } catch (e) {
          console.warn('Error stopping sequence:', e);
        }
        sequenceRef.current = null;
      }
      
      // Then stop transport
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

    // Start playback
    console.log('Starting playback');
    setIsLoading(true);
    await initializeSynths();

    try {
      const Tone: any = toneRef.current;
      if (!Tone) {
        console.error('Tone is null!');
        setIsLoading(false);
        return;
      }

      // Start audio context
      if (typeof Tone.start === 'function') {
        await Tone.start();
      }
      console.log('Audio context started');

      // Set tempo
      Tone.Transport.bpm.value = bpm;
      console.log(`Tempo set to ${bpm} BPM`);

      // Create sequence that iterates through each time step (column)
      // At each step, play all notes that are active in that column
      sequenceRef.current = new Tone.Sequence(
        (time: number, step: number) => {
          console.log('Step:', step);

          // Update current step for visual feedback
          Tone.Draw.schedule(() => {
            setCurrentStep(step);
          }, time);

          // Check all instruments and all pitches for this step
          grid.forEach((instrument, instrumentIndex) => {
            instrument.forEach((pitchRow, pitchIndex) => {
              // If this block is active at this step, play it
              if (pitchRow[step]) {
                const note = INSTRUMENTS[instrumentIndex].notes[pitchIndex];
                console.log(`Playing note: ${note} at step ${step} on instrument ${instrumentIndex}`);
                synthsRef.current[instrumentIndex].triggerAttackRelease(note, "16n", time);
              }
            });
          });
        },
        Array.from({ length: STEPS }, (_, i) => i), // Iterate through all 24 steps
        "16n" // Each step is a 16th note
      );

      console.log('Starting sequence and transport');
      // Make the sequence loop infinitely
      if (sequenceRef.current.loop !== undefined) {
        sequenceRef.current.loop = true;
      }
      sequenceRef.current.start(0);
      Tone.Transport.start();
      setIsPlaying(true);
      console.log('Playback started!');
    } catch (e) {
      console.warn('Error starting playback:', e);
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, grid, initializeSynths, bpm]);

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

  const handleClear = useCallback(() => {
    // Reset the grid to all false
    setGrid(INSTRUMENTS.map(instrument => 
      Array.from({ length: instrument.pitchCount }, () => 
        Array(STEPS).fill(false)
      )
    ));
  }, []);

  const handleBpmChange = useCallback((value: string) => {
    // Allow empty string or valid numbers
    if (value === "") {
      setBpmInput("");
      return;
    }
    
    const numValue = Number(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 240) {
      setBpmInput(value);
      if (numValue >= 20) {
        setBpm(numValue);
      }
    }
  }, []);

  const handleBpmBlur = useCallback(() => {
    // If empty or invalid, set to default 60
    if (bpmInput === "" || Number(bpmInput) < 20) {
      setBpm(60);
      setBpmInput("60");
    }
  }, [bpmInput]);

  // Save handlers
  const handleSave = useCallback(async () => {
    if (currentProjectId) {
      // Update existing project
      setIsSaving(true);
      try {
        await updateProject(currentProjectId, {
          name: projectName,
          grid_data: grid,
          bpm,
        });
        alert("Project saved successfully!");
      } catch (error) {
        console.error("Error saving project:", error);
        alert("Failed to save project. Please try again.");
      } finally {
        setIsSaving(false);
      }
    } else {
      // No project loaded, show save dialog
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
    if (!saveModalName.trim()) {
      alert("Please enter a project name");
      return;
    }

    setIsSaving(true);
    try {
      if (isSaveAs || !currentProjectId) {
        // Create new project
        const newProject = await createProject({
          name: saveModalName.trim(),
          grid_data: grid,
          bpm,
        });
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

    if (router.isReady) {
      loadProject();
    }
  }, [router.isReady, router.query]);

  // Sync bpmInput with bpm when bpm changes externally
  useEffect(() => {
    setBpmInput(String(bpm));
  }, [bpm]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const Tone: any = toneRef.current;
      if (Tone?.Transport) {
        Tone.Transport.stop();
        Tone.Transport.cancel();
      }
      if (sequenceRef.current) {
        sequenceRef.current.stop();
        sequenceRef.current.dispose();
      }
      synthsRef.current.forEach(synth => {
        if (synth && typeof synth.dispose === 'function') {
          synth.dispose();
        }
      });
    };
  }, []);

  return (
    <div className="min-h-screen bg-black">
      <Header />
      <div className="flex flex-col items-center justify-center p-8 gap-6">
        {/* Project Name Display */}
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

          {/* BPM Control */}
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-400 border-4 border-yellow-600 shadow-[4px_4px_0px_0px_rgba(139,69,0,1)]">
            <label htmlFor="bpm" className="text-xs font-bold text-black">
              BPM:
            </label>
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
              <div key={instrumentIndex} className="flex items-start gap-2">
                {/* Instrument Label - Sticky */}
                <div className="w-20 px-2 py-1 text-[8px] font-bold text-black bg-cyan-400 border-2 border-cyan-600 text-center sticky left-4 z-30 shadow-md">
                  {instrument.name.toUpperCase()}
                </div>

                {/* Note Labels (outside the grid) - Sticky */}
                <div className="flex flex-col sticky left-24 z-30 bg-gray-900 shadow-sm overflow-hidden">
                  {/* Spacer for column numbers */}
                  <div className="h-4 mb-1"></div>
                  
                  {/* Note labels */}
                  <div className="flex flex-col-reverse">
                    {grid[instrumentIndex].map((_, pitchIndex) => {
                      // Get the note name for this pitch
                      // pitchIndex 0 = lowest note, renders at bottom due to flex-col-reverse
                      const noteName = instrument.notes[pitchIndex];
                      const isSharp = noteName.includes('#');
                      
                      return (
                        <div key={pitchIndex} className={`h-3 px-1 text-[6px] font-bold flex items-center justify-end w-8 ${
                          isSharp ? 'text-cyan-300' : 'text-green-400'
                        }`}>
                          {noteName}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Piano Roll Grid Container */}
                <div className="flex flex-col">
                  {/* Column Numbers */}
                  <div className="flex mb-1 h-4">
                    {Array.from({ length: STEPS }).map((_, stepIndex) => {
                      const isGroupStart = stepIndex % 4 === 0;
                      const groupNumber = Math.floor(stepIndex / 4) + 1; // 1, 2, 3, 4, 5...
                      return (
                        <div
                          key={stepIndex}
                          className="w-6 text-[8px] text-center font-bold text-yellow-400 flex items-center justify-center"
                        >
                          {isGroupStart ? groupNumber : ''}
                        </div>
                      );
                    })}
                  </div>

                  {/* Piano Roll Grid for this instrument */}
                  <div className="flex flex-col-reverse border-4 border-cyan-400 overflow-hidden min-w-max shadow-[4px_4px_0px_0px_rgba(0,139,139,1)]">
                {/* Render pitch rows from high to low (reversed for natural piano layout) */}
                {grid[instrumentIndex].map((pitchRow, pitchIndex) => {
                  // Check if this pitch is a sharp note
                  const noteName = instrument.notes[pitchIndex];
                  const isSharpRow = noteName.includes('#');
                  
                  return (
                  <div key={pitchIndex} className="flex">
                    {/* Render time steps in groups of 4 */}
                    {pitchRow.map((isActive, stepIndex) => {
                      // Add left border for group starts, but not the first column
                      const isGroupStart = stepIndex > 0 && stepIndex % 4 === 0;
                      // Add horizontal divider for all rows except the bottom one (pitchIndex 0 = bottom after reverse)
                      const needsHorizontalBorder = pitchIndex > 0;
                      // Highlight current step during playback
                      const isCurrentColumn = currentStep === stepIndex;
                      return (
                        <button
                          key={stepIndex}
                          onClick={() => handleToggle(instrumentIndex, pitchIndex, stepIndex)}
                          className={`w-6 h-3 transition-all relative border hover:ring-2 hover:ring-cyan-400 hover:ring-inset ${
                            needsHorizontalBorder ? 'border-b border-b-gray-700' : ''
                          } ${
                            isGroupStart ? 'border-l-2 border-l-cyan-400 z-10' : 'border-l border-l-gray-700'
                          } ${
                            isCurrentColumn ? 'ring-2 ring-yellow-300 ring-inset !z-20 animate-pulse' : ''
                          } ${
                            isActive 
                              ? 'bg-green-400 hover:bg-green-500 border-green-600' 
                              : isSharpRow 
                                ? 'bg-gray-700 hover:bg-gray-600 border-gray-800' 
                                : 'bg-gray-800 hover:bg-gray-700 border-gray-900'
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
    </div>
  );
}

