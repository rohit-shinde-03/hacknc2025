import React from 'react';

interface ControlPanelProps {
  isPlaying: boolean;
  isLoading: boolean;
  bpmInput: string;
  steps: number;
  onPlay: () => void;
  onClear: () => void;
  onBpmChange: (value: string) => void;
  onBpmBlur: () => void;
  onAddSegment: () => void;
  onRemoveSegment: () => void;
}

export default function ControlPanel({
  isPlaying,
  isLoading,
  bpmInput,
  steps,
  onPlay,
  onClear,
  onBpmChange,
  onBpmBlur,
  onAddSegment,
  onRemoveSegment,
}: ControlPanelProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap justify-center">
      <button
        onClick={onPlay}
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
        onClick={onClear}
        disabled={isLoading || isPlaying}
        className="px-8 py-3 text-sm font-bold bg-purple-500 hover:bg-purple-600 text-white border-4 border-purple-700 shadow-[4px_4px_0px_0px_rgba(75,0,130,1)] transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed active:translate-x-1 active:translate-y-1 active:shadow-none"
      >
        CLEAR
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
          onChange={(e) => onBpmChange(e.target.value)}
          onBlur={onBpmBlur}
          disabled={isPlaying}
          className="w-20 px-2 py-1 text-center text-black font-bold bg-white border-2 border-black focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="60"
        />
      </div>

      {/* Segment Control */}
      <div className="flex items-center gap-2 px-4 py-2 bg-purple-500 border-4 border-purple-700 shadow-[4px_4px_0px_0px_rgba(75,0,130,1)]">
        <button
          onClick={onRemoveSegment}
          disabled={isPlaying || steps <= 16}
          className="w-8 h-8 text-lg font-bold text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          title="Remove 4 steps"
        >
          -
        </button>
        <span className="text-xs font-bold text-white min-w-[60px] text-center">
          {steps} STEPS
        </span>
        <button
          onClick={onAddSegment}
          disabled={isPlaying || steps >= 128}
          className="w-8 h-8 text-lg font-bold text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          title="Add 4 steps"
        >
          +
        </button>
      </div>
    </div>
  );
}

