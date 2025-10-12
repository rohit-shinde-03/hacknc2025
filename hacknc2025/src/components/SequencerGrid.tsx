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
  currentStep: number;
  steps: number;
  onToggle: (instrumentIndex: number, pitchIndex: number, stepIndex: number) => void;
}

export default function SequencerGrid({
  instruments,
  grid,
  currentStep,
  steps,
  onToggle,
}: SequencerGridProps) {
  return (
    <div className="w-full max-w-6xl overflow-x-auto overflow-y-visible border-4 border-cyan-400 shadow-[8px_8px_0px_0px_rgba(0,139,139,1)] bg-gray-900">
      <div className="space-y-4 p-4 min-w-max">
        {instruments.map((instrument, instrumentIndex) => (
          <InstrumentSection
            key={instrumentIndex}
            instrumentName={instrument.name}
            notes={instrument.notes}
            grid={grid[instrumentIndex]}
            currentStep={currentStep}
            steps={steps}
            onToggle={(pitchIndex, stepIndex) => onToggle(instrumentIndex, pitchIndex, stepIndex)}
          />
        ))}
      </div>
    </div>
  );
}

