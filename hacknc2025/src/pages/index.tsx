import { useState, useCallback } from "react";
import Header from "@/components/Header";
import ControlPanel from "@/components/ControlPanel";
import SequencerGrid from "@/components/SequencerGrid";
import SaveModal from "@/components/SaveModal";
import { useToneSequencer } from "@/hooks/useToneSequencer";
import { useProjectManager } from "@/hooks/useProjectManager";

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
  // Initialize 3D grid: [instrumentIndex][pitchIndex][stepIndex]
  const [grid, setGrid] = useState<boolean[][][]>(() =>
    INSTRUMENTS.map(instrument =>
      Array.from({ length: instrument.pitchCount }, () =>
        Array(STEPS).fill(false)
      )
    )
  );

  const [bpm, setBpm] = useState(120);
  const [bpmInput, setBpmInput] = useState("120");

  // Use custom hooks for sequencer and project management
  const {
    isPlaying,
    currentStep,
    isLoading,
    playSound,
    handlePlay,
    handleClear,
  } = useToneSequencer(INSTRUMENTS, grid, STEPS, bpm);

  const {
    showSaveModal,
    saveModalName,
    isSaving,
    handleSave,
    handleSaveAs,
    confirmSave,
    cancelSave,
    setSaveModalName,
  } = useProjectManager(grid, bpm);

  const handleToggle = useCallback((instrumentIndex: number, pitchIndex: number, stepIndex: number) => {
    setGrid((prevGrid) => {
      const newGrid = prevGrid.map((instrument, iIdx) =>
        instrument.map((pitch, pIdx) =>
          pitch.map((step, sIdx) =>
            iIdx === instrumentIndex && pIdx === pitchIndex && sIdx === stepIndex
              ? !step
              : step
          )
        )
      );

      // Play sound if activating
      const isActivating = newGrid[instrumentIndex][pitchIndex][stepIndex];
      if (isActivating) {
        const note = INSTRUMENTS[instrumentIndex].notes[pitchIndex];
        const waveform = INSTRUMENTS[instrumentIndex].type;
        playSound(note, waveform);
      }

      return newGrid;
    });
  }, [playSound]);

  const handleClearGrid = useCallback(() => {
    if (handleClear()) {
      setGrid(
        INSTRUMENTS.map(instrument =>
          Array.from({ length: instrument.pitchCount }, () =>
            Array(STEPS).fill(false)
          )
        )
      );
    }
  }, [handleClear]);

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

  return (
    <div className="min-h-screen bg-black">
      <Header />
      
      <div className="flex flex-col items-center justify-center p-8 gap-6">
        <ControlPanel
          isPlaying={isPlaying}
          isLoading={isLoading}
          isSaving={isSaving}
          bpmInput={bpmInput}
          onPlay={handlePlay}
          onClear={handleClearGrid}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onBpmChange={handleBpmChange}
          onBpmBlur={handleBpmBlur}
        />

        <SequencerGrid
          instruments={INSTRUMENTS}
          grid={grid}
          currentStep={currentStep}
          steps={STEPS}
          onToggle={handleToggle}
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
