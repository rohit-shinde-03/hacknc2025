import React from 'react';
import InstrumentSection from './InstrumentSection';

interface Instrument {
  name: string;
  type: string;
  pitchCount: number;
  baseNote: string;
  notes: string[];
}

interface SequencerGridProps {
  instruments: Instrument[];
  grid: boolean[][][];
  durationGrid: number[][][];
  currentStep: number;
  steps: number;
  volumes: number[];
  onNoteCreate: (instrumentIndex: number, pitchIndex: number, startStep: number, endStep: number) => void;
  onNoteDelete: (instrumentIndex: number, pitchIndex: number, stepIndex: number) => void;
  onVolumeChange: (instrumentIndex: number, newVolume: number) => void;
  isPlaying: boolean;
}

export default function SequencerGrid({
  instruments,
  grid,
  durationGrid,
  currentStep,
  steps,
  volumes,
  onNoteCreate,
  onNoteDelete,
  onVolumeChange,
  isPlaying,
}: SequencerGridProps) {
  return (
    <div className="w-full max-w-6xl overflow-x-auto overflow-y-visible border-4 border-cyan-400 shadow-[8px_8px_0px_0px_rgba(0,139,139,1)] bg-gray-900">
      <div className="space-y-4 p-4 min-w-max">
        {instruments.map((instrument, instrumentIndex) => (
          <InstrumentSection
            key={instrumentIndex}
            instrumentIndex={instrumentIndex}
            instrumentName={instrument.name}
            notes={instrument.notes}
            grid={grid[instrumentIndex]}
            durationGrid={durationGrid[instrumentIndex]}
            currentStep={currentStep}
            steps={steps}
            volume={volumes[instrumentIndex]}
            onNoteCreate={onNoteCreate}
            onNoteDelete={onNoteDelete}
            onVolumeChange={onVolumeChange}
            isPlaying={isPlaying}
          />
        ))}
      </div>
    </div>
  );
}

