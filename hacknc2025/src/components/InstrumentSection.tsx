import React from 'react';

interface InstrumentSectionProps {
  instrumentName: string;
  notes: string[];
  grid: boolean[][];
  currentStep: number;
  steps: number;
  onToggle: (pitchIndex: number, stepIndex: number) => void;
}

export default function InstrumentSection({
  instrumentName,
  notes,
  grid,
  currentStep,
  steps,
  onToggle,
}: InstrumentSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Instrument Label - Sticky at top */}
      <div className="px-3 py-1 ml-4 text-[10px] font-bold text-black bg-cyan-400 border-2 border-cyan-600 text-center sticky left-0 z-30 shadow-md w-fit">
        {instrumentName.toUpperCase()}
      </div>

      {/* Grid and labels container */}
      <div className="flex items-start gap-2">
        {/* Note Labels (outside the grid) - Sticky */}
        <div className="flex flex-col sticky left-0 z-30 bg-gray-900 shadow-sm overflow-hidden pl-4 pr-2 pb-3">
          {/* Spacer for column numbers */}
          <div className="h-4 mb-1"></div>
          
          {/* Note labels */}
          <div className="flex flex-col-reverse">
            {grid.map((_, pitchIndex) => {
              const noteName = notes[pitchIndex];
              const isSharp = noteName.includes('#');
              
              return (
                <div 
                  key={pitchIndex} 
                  className={`h-6 text-[8px] font-bold flex items-center justify-end w-10 ${
                    isSharp ? 'text-cyan-300' : 'text-green-400'
                  }`}
                >
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
            {Array.from({ length: steps }).map((_, stepIndex) => {
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

          {/* Piano Roll Grid */}
          <div className="flex flex-col-reverse border-4 border-cyan-400 overflow-hidden min-w-max shadow-[4px_4px_0px_0px_rgba(0,139,139,1)]">
            {grid.map((pitchRow, pitchIndex) => {
              const noteName = notes[pitchIndex];
              const isSharpRow = noteName.includes('#');
              
              return (
                <div key={pitchIndex} className="flex">
                  {pitchRow.map((isActive, stepIndex) => {
                    const isGroupStart = stepIndex > 0 && stepIndex % 4 === 0;
                    const needsHorizontalBorder = pitchIndex > 0;
                    const isCurrentColumn = currentStep === stepIndex;
                    
                    return (
                      <button
                        key={stepIndex}
                        onClick={() => onToggle(pitchIndex, stepIndex)}
                        className={`w-10 h-6 transition-all relative border border-gray-400 hover:ring-2 hover:ring-cyan-400 hover:ring-inset ${
                          needsHorizontalBorder ? 'border-b border-b-gray-400' : ''
                        } ${
                          isGroupStart ? 'border-l-2 border-l-cyan-400 z-10' : 'border-l border-l-gray-400'
                        } ${
                          isCurrentColumn ? 'ring-2 ring-yellow-300 ring-inset !z-20 animate-pulse' : ''
                        } ${
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
  );
}

