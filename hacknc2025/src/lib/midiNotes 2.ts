// src/lib/midiNotes.ts
// Lightweight note name <-> MIDI converters for standard names like "C4", "G#3"
const SEMIS = { "C":0, "C#":1, "Db":1, "D":2, "D#":3, "Eb":3, "E":4, "F":5, "F#":6, "Gb":6, "G":7, "G#":8, "Ab":8, "A":9, "A#":10, "Bb":10, "B":11 } as const;

export function noteToMidi(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error(`Bad note: ${name}`);
  const letter = m[1].toUpperCase() as keyof typeof SEMIS;
  const accidental = (m[2] || "") as "#" | "b" | "";
  const oct = parseInt(m[3], 10);
  const key = (letter + accidental) as keyof typeof SEMIS;
  const semi = SEMIS[key];
  return (oct + 1) * 12 + semi; // MIDI definition: C-1 = 0
}

export function midiToNote(midi: number): string {
  const n = Math.max(0, Math.min(127, Math.floor(midi)));
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const name = names[n % 12];
  const oct = Math.floor(n / 12) - 1;
  return `${name}${oct}`;
}
