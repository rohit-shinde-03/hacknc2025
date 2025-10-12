// src/lib/gridEncoding.ts
import { HOLD_ID, REST_ID, PITCH_BASE } from "./tokens";
import { midiToNote } from "./midiNotes"; // just for mapping; optional if you track MIDI directly

export type InstrumentSpec = { notes: string[] }; // e.g., ["C3","C#3",...]

export function gridToLeadTokens(
  grid: boolean[][][],           // [instrument][pitchIndex][step]
  instruments: InstrumentSpec[], // same shape as grid for note names
  steps: number
): number[] {
  const tokens: number[] = [];
  let prevMidi: number | null = null;
  const nameToMidi = (name: string) => {
    const m = /^([A-G])(#|b)?(-?\d+)$/.exec(name)!;
    const idx = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"].indexOf((m[1]+(m[2]||"")).toUpperCase());
    return (parseInt(m[3],10)+1)*12 + idx;
  };
  for (let s=0; s<steps; s++) {
    const active: number[] = [];
    for (let inst=0; inst<grid.length; inst++) {
      const pitches = grid[inst];
      for (let p=0; p<pitches.length; p++) if (pitches[p][s]) active.push(nameToMidi(instruments[inst].notes[p]));
    }
    if (active.length === 0) { tokens.push(prevMidi===null ? REST_ID : HOLD_ID); continue; }
    const midi = active.sort((a,b)=>b-a)[0];
    if (prevMidi===null || midi!==prevMidi) { tokens.push(PITCH_BASE + midi); prevMidi = midi; }
    else tokens.push(HOLD_ID);
  }
  return tokens;
}
