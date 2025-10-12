import { Midi } from '@tonejs/midi';

interface Instrument {
  name: string;
  type: string;
  pitchCount: number;
  baseNote: string;
  notes: string[];
}

export function exportToMidi(
  instruments: Instrument[],
  grid: boolean[][][],
  durationGrid: number[][][],
  bpm: number,
  projectName: string
): void {
  // Create a new MIDI file
  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.header.name = projectName;

  // Add a track for each instrument
  instruments.forEach((instrument, instrumentIndex) => {
    const track = midi.addTrack();
    track.name = instrument.name;
    
    // Map instrument types to MIDI program numbers (General MIDI)
    const programMap: { [key: string]: number } = {
      'square': 80,    // Lead 1 (square)
      'triangle': 33,  // Acoustic Bass
      'pulse': 81,     // Lead 2 (sawtooth/pulse)
      'sawtooth': 81,
      'sine': 88       // Pad 8 (sweep)
    };
    
    track.instrument.number = programMap[instrument.type] || 0;

    // Iterate through all pitches and steps for this instrument
    for (let pitchIndex = 0; pitchIndex < instrument.pitchCount; pitchIndex++) {
      for (let stepIndex = 0; stepIndex < grid[instrumentIndex][pitchIndex].length; stepIndex++) {
        if (grid[instrumentIndex][pitchIndex][stepIndex]) {
          const note = instrument.notes[pitchIndex];
          const duration = durationGrid[instrumentIndex][pitchIndex][stepIndex];
          
          // Calculate timing: each step is a 16th note (0.25 beats)
          const startTime = stepIndex * 0.25; // in beats
          const durationTime = duration * 0.25; // in beats
          
          // Add note to track
          track.addNote({
            midi: noteNameToMidi(note),
            time: startTime,
            duration: durationTime,
            velocity: 0.8 // moderate velocity
          });
        }
      }
    }
  });

  // Convert to array buffer and trigger download
  const midiArray = midi.toArray();
  const blob = new Blob([midiArray], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}.mid`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up
  URL.revokeObjectURL(url);
}

// Convert note name (e.g., "C4") to MIDI number (e.g., 60)
function noteNameToMidi(noteName: string): number {
  const noteMap: { [key: string]: number } = {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
    'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
  };
  
  // Parse note name (e.g., "C#4" -> note: "C#", octave: 4)
  const match = noteName.match(/^([A-G]#?)(\d+)$/);
  if (!match) {
    console.error('Invalid note name:', noteName);
    return 60; // Default to middle C
  }
  
  const [, note, octave] = match;
  const midiNumber = (parseInt(octave) + 1) * 12 + noteMap[note];
  
  return midiNumber;
}

