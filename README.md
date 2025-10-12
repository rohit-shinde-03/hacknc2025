# 8‑Bit Beat Maker (HackNC 2025)

A web-based chiptune sequencer with AI-assisted composition. Build catchy 8‑bit loops using Square, Triangle, and Pulse wave instruments, then let AI autocomplete melodies, arpeggios, and basslines. Save projects to Supabase and export your creations as MIDI.

## Features
- AI composition via Gemini 2.5 (server routes in Next.js)
- Interactive step sequencer with sustain-length per note
- Three classic instruments: Square (lead), Triangle (bass), Pulse (arp/counter)
- Variable length grid (16–64 steps), tempo control, per‑instrument volume
- Project save/load/duplicate/delete with Supabase
- MIDI export using @tonejs/midi

## Tech Stack
- Next.js 15, React 19, TypeScript
- Tone.js for audio synthesis and transport
- @tonejs/midi for MIDI export
- Supabase JS for auth and Postgres
- Google Generative AI for composition (Gemini 2.5 Flash)
- Tailwind CSS 4 (PostCSS) for styling

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Supabase project with a `projects` table (schema below)
- Google AI Studio API key (Gemini)
- Optional: Python model server for next‑note prediction

### Environment Variables
Create a `.env.local` in the project root with:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
# Either variable name is accepted by the code
GOOGLE_API_KEY=your_gemini_api_key
# or
GEMINI_API_KEY=your_gemini_api_key

# Optional: Python server endpoint used by /api/predict-next-note
PREDICT_URL=http://127.0.0.1:8000/predict
```

### Install & Run
```bash
npm install
npm run dev
```
Then open http://localhost:3000.

### Available Scripts
- `npm run dev`: Start Next.js dev server
- `npm run build`: Build for production
- `npm start`: Start production server
- `npm run lint`: Run ESLint

## Data Model (Supabase)
Table: `projects`
```sql
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  grid_data jsonb not null,         -- boolean[][][]
  duration_data jsonb,              -- number[][][] (optional, for sustain)
  bpm integer not null default 120,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
TypeScript types are in `src/types/project.ts`.

## App Structure
- `src/pages/index.tsx`: Main sequencer UI with AI compose section and MIDI export.
- `src/hooks/useToneSequencer.ts`: Tone.js playback, transport, volumes, and scheduling.
- `src/hooks/useProjectManager.ts`: Save/Save As flow, project naming, wiring to Supabase utils.
- `utils/midiExport.ts`: Converts grid + durations to a downloadable `.mid` file.
- `utils/projects.ts`: CRUD wrappers for Supabase `projects` table.
- `utils/supabase.ts`: Supabase client using env vars.
- `src/pages/projects.tsx`: Manage existing projects (rename, duplicate, delete, open).
- `src/pages/login.tsx`: Auth UI using Supabase email/password.
- Components: `Header`, `ControlPanel`, `SequencerGrid`, `SaveModal`, `InstrumentSection`, `Block`.

## AI Endpoints
- `POST /api/gemini-compose-mdb`
  - Body: `{ prompt: string, instruments: {index?: number, name: string, notes: string[]}[], steps?: number, startStep?: number, seed?: { events: { step: number, instrumentIdx: number, note: string, length: number }[] }, maxEvents?: number, stepQuant?: number, maxPolyphony?: number }`
  - Returns: `{ events: { relStep: number, instrumentIdx: number, note: string, length: number }[] }`
  - Uses `@google/generative-ai` and extracts strict JSON from Gemini response.

- `POST /api/gemini-melody`
  - Body: `{ prompt, instruments, maxEvents?, stepQuant?, maxPolyphony? }`
  - Returns: `{ events: { relStep, instrumentIdx, note, length }[] }`
  - Uses structured JSON output with schema enforcement (alternative flow).

- `POST /api/predict-next-note`
  - Body: `{ input_ids: number[] }`
  - Proxies to a Python server at `PREDICT_URL` (see `src/ai/server/`).

## Usage Guide
1. Navigate to `/login` and create an account or sign in.
2. On `/`:
   - Click grid cells to place note heads; drag to set sustain length.
   - Adjust BPM, grid steps, and instrument volumes.
   - Enter a style prompt and click “Generate Music” to autocomplete.
   - Export to MIDI at any time.
3. Save projects; visit `/projects` to manage them.

## Python Model (Optional)
- Python server examples in `src/ai/server/python_server_main.py` and `python_server_gpu.py`.
- The Next.js route `/api/predict-next-note` forwards requests to `PREDICT_URL`.

## Development Notes
- Ensure browser audio starts after a user gesture; `useToneSequencer` handles `Tone.start()`.
- `duration_data` is optional to support older saves; UI will default sustain to 1.
- Instrument notes are constrained to chip‑style ranges defined in `index.tsx`.

## Screenshots (optional)
Add screenshots to `public/` and reference them here.

## License
MIT (update if different). 