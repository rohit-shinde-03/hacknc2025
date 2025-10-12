import { useState, useCallback } from "react";
import Header from "@/components/Header";
import ControlPanel from "@/components/ControlPanel";
import SequencerGrid from "@/components/SequencerGrid";
import SaveModal from "@/components/SaveModal";
import { useToneSequencer } from "@/hooks/useToneSequencer";
import { useProjectManager } from "@/hooks/useProjectManager";
import { exportToMidi } from "../../utils/midiExport";

const MIN_STEPS = 16; // Minimum 4 groups of 4
const MAX_STEPS = 128; // Maximum 32 groups of 4

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

export default function Home() {
  const [steps, setSteps] = useState(64); // Start with 16 groups of 4

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
      );
      return newDuration;
    });

    // Play sound
    const note = INSTRUMENTS[instrumentIndex].notes[pitchIndex];
    const waveform = INSTRUMENTS[instrumentIndex].type;
    playSound(note, waveform);
  }, [playSound]);

  const handleNoteDelete = useCallback((instrumentIndex: number, pitchIndex: number, stepIndex: number) => {
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
    }
  }, []);

  const handleBpmBlur = useCallback(() => {
    if (!bpmInput || parseInt(bpmInput, 10) < 20) {
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
