import React, { useState, useCallback, useRef } from 'react';

interface InstrumentSectionProps {
  instrumentIndex: number;
  instrumentName: string;
  notes: string[];
  grid: boolean[][];
  durationGrid: number[][];
  currentStep: number;
  steps: number;
  volume: number;
  onNoteCreate: (instrumentIndex: number, pitchIndex: number, startStep: number, endStep: number) => void;
  onNoteDelete: (instrumentIndex: number, pitchIndex: number, stepIndex: number) => void;
  onVolumeChange: (instrumentIndex: number, newVolume: number) => void;
  isPlaying: boolean;
}

export default function InstrumentSection({
  instrumentIndex,
  instrumentName,
  notes,
  grid,
  durationGrid,
  currentStep,
  steps,
  volume,
  onNoteCreate,
  onNoteDelete,
  onVolumeChange,
  isPlaying,
}: InstrumentSectionProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ pitch: number; step: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ pitch: number; step: number } | null>(null);
  const isDraggingRef = useRef(false);

  const handleMouseDown = useCallback((pitchIndex: number, stepIndex: number) => {
    if (isPlaying) return;
    
    // If clicking on an active note, delete it
    if (grid[pitchIndex][stepIndex]) {
      onNoteDelete(instrumentIndex, pitchIndex, stepIndex);
      return;
    }

    // Start dragging for new note
    setIsDragging(true);
    isDraggingRef.current = true;
    setDragStart({ pitch: pitchIndex, step: stepIndex });
    setDragEnd({ pitch: pitchIndex, step: stepIndex });
  }, [grid, onNoteDelete, instrumentIndex, isPlaying]);

  const handleMouseEnter = useCallback((pitchIndex: number, stepIndex: number) => {
    if (!isDraggingRef.current || !dragStart) return;
    
    // Only allow horizontal dragging (same pitch)
    if (pitchIndex === dragStart.pitch) {
      setDragEnd({ pitch: pitchIndex, step: stepIndex });
    }
  }, [dragStart]);

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current || !dragStart || !dragEnd) {
      setIsDragging(false);
      isDraggingRef.current = false;
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    // Create the note with the dragged duration
    const startStep = Math.min(dragStart.step, dragEnd.step);
    const endStep = Math.max(dragStart.step, dragEnd.step);
    
    onNoteCreate(instrumentIndex, dragStart.pitch, startStep, endStep);

    // Reset drag state
    setIsDragging(false);
    isDraggingRef.current = false;
    setDragStart(null);
    setDragEnd(null);
  }, [dragStart, dragEnd, onNoteCreate, instrumentIndex]);

  // Add global mouseup listener
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        handleMouseUp();
      }
    };
    
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [handleMouseUp]);

  // Helper function to check if a cell is part of a sustained note
  const getCellType = (pitchIndex: number, stepIndex: number) => {
    const isActive = grid[pitchIndex][stepIndex];
    const duration = durationGrid[pitchIndex][stepIndex];
    
    if (isActive && duration > 1) {
      return 'sustained-start';
    }
    
    // Check if this cell is within a sustained note's duration
    for (let i = stepIndex - 1; i >= Math.max(0, stepIndex - 10); i--) {
      if (grid[pitchIndex][i]) {
        const startDuration = durationGrid[pitchIndex][i];
        const endOfNote = i + startDuration - 1;
        if (stepIndex <= endOfNote) {
          return 'sustained-middle';
        }
        break;
      }
    }
    
    return isActive ? 'active' : 'empty';
  };

  // Helper function to check if cell is part of drag preview
  const isInDragPreview = (pitchIndex: number, stepIndex: number) => {
    if (!isDragging || !dragStart || !dragEnd || pitchIndex !== dragStart.pitch) {
      return false;
    }
    const minStep = Math.min(dragStart.step, dragEnd.step);
    const maxStep = Math.max(dragStart.step, dragEnd.step);
    return stepIndex >= minStep && stepIndex <= maxStep;
  };
  return (
    <div className="flex flex-col gap-2">
      {/* Instrument Label and Volume Control */}
      <div className="flex items-center gap-3 ml-4 sticky left-0 z-30 bg-gray-900">
        <div className="px-3 py-1 text-[10px] font-bold text-black bg-cyan-400 border-2 border-cyan-600 text-center shadow-md">
          {instrumentName.toUpperCase()}
        </div>
        
        {/* Volume Slider */}
        <div className="flex items-center gap-2 bg-gray-800 px-3 py-1 border-2 border-gray-600">
          <span className="text-[8px] font-bold text-yellow-400">VOL</span>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => onVolumeChange(instrumentIndex, Number(e.target.value))}
            className="w-24 h-1 bg-gray-700 appearance-none cursor-pointer accent-cyan-400"
            style={{
              background: `linear-gradient(to right, #22d3ee 0%, #22d3ee ${volume}%, #374151 ${volume}%, #374151 100%)`
            }}
          />
          <span className="text-[8px] font-bold text-cyan-400 min-w-[24px]">{volume}%</span>
        </div>
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
          <div className="flex flex-col-reverse border-4 border-cyan-400 overflow-hidden min-w-max shadow-[4px_4px_0px_0px_rgba(0,139,139,1)] select-none">
            {grid.map((pitchRow, pitchIndex) => {
              const noteName = notes[pitchIndex];
              const isSharpRow = noteName.includes('#');
              
              return (
                <div key={pitchIndex} className="flex">
                  {pitchRow.map((isActive, stepIndex) => {
                    const isGroupStart = stepIndex > 0 && stepIndex % 4 === 0;
                    const needsHorizontalBorder = pitchIndex > 0;
                    const isCurrentColumn = currentStep === stepIndex;
                    const cellType = getCellType(pitchIndex, stepIndex);
                    const inDragPreview = isInDragPreview(pitchIndex, stepIndex);
                    
                    // Determine background color based on cell type
                    let bgColor = isSharpRow ? 'bg-gray-700' : 'bg-gray-800';
                    let hoverColor = isSharpRow ? 'hover:bg-gray-600' : 'hover:bg-gray-700';
                    
                    if (cellType === 'active') {
                      bgColor = 'bg-green-400';
                      hoverColor = 'hover:bg-green-500';
                    } else if (cellType === 'sustained-start') {
                      bgColor = 'bg-cyan-400';
                      hoverColor = 'hover:bg-cyan-500';
                    } else if (cellType === 'sustained-middle') {
                      bgColor = 'bg-cyan-500 opacity-75';
                      hoverColor = 'hover:bg-cyan-600';
                    }
                    
                    // Drag preview styling
                    if (inDragPreview) {
                      bgColor = 'bg-blue-300';
                      hoverColor = 'hover:bg-blue-400';
                    }
                    
                    return (
                      <button
                        key={stepIndex}
                        onMouseDown={() => handleMouseDown(pitchIndex, stepIndex)}
                        onMouseEnter={() => handleMouseEnter(pitchIndex, stepIndex)}
                        className={`w-10 h-6 transition-all relative border border-gray-400 hover:ring-2 hover:ring-cyan-400 hover:ring-inset ${
                          needsHorizontalBorder ? 'border-b border-b-gray-400' : ''
                        } ${
                          isGroupStart ? 'border-l-2 border-l-cyan-400 z-10' : 'border-l border-l-gray-400'
                        } ${
                          isCurrentColumn ? 'ring-2 ring-yellow-300 ring-inset !z-20 animate-pulse' : ''
                        } ${bgColor} ${hoverColor}`}
                        aria-pressed={isActive}
                        disabled={isPlaying}
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

