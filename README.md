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
NES-MDB RAG + Gemini 2.5 Flash
==============================

Grounded, NES-authentic composition powered by **Retrieval-Augmented Generation (RAG)** over **NES-MDB**, served by **Gemini 2.5 Flash** with structured JSON output.

TL;DR
-----

*   **Before (no RAG):** Flash guessed the style from a short vibe prompt → results could drift (less NES-authentic phrasing, inconsistent density).
    
*   **Now (with RAG):** We embed the user’s tiny prompt and **retrieve real NES cues** (game/track/summary) from Supabase/pgvector. Flash composes **in that idiom**, continuing from the user’s seed notes, and returns structured { events:\[...\] }.
    

What RAG Changes (at a glance)
------------------------------

*   **Authenticity ↑**Retrieved references bias Flash toward **square-lead stabs, triangle bass behavior, pulse runs** and chip-correct ranges.
    
*   **Consistency ↑**Similar prompts produce similar structures (boss feels like boss; overworld feels like overworld).
    
*   **Prompt burden ↓**Users can type **3–6 words** (series/scene/mood). No BPM or theory jargon required.
    
*   **Autocomplete that respects the grid**We send **seed events** and a startStep. Flash **continues after** the user’s notes in the retrieved style.
    
*   **Explainability**We surface **retrieved sources** (e.g., MegaMan4 — LastBoss) so you can point to _why_ it sounds that way.
    

How It Works
------------

1.  **Embed prompt** (or series/scene/mood) with gemini-embedding-001 (**768-dim**).
    
2.  **Vector search** in Supabase **pgvector** (match\_nes\_chunks RPC) to get **top-K** NES tracks.
    
3.  **Craft context**: compact {game, track, summary} joins the user’s seed notes + constraints.
    
4.  **Generate with Flash**:
    
    *   Model: gemini-2.5-flash
        
    *   **Structured output**: JSON schema → { events:\[{ relStep, instrumentIdx, note, length }\] }
        
    *   **Tempo context**: we tell Flash the **BPM**, **steps per bar**, and **beats per bar** for density that “feels right”.
        
    *   **Windowing**: fill barSteps × fillBars, optionally **tile** a motif if the model under-fills (fillUniform).
        

Quick A/B Demo (30s)
--------------------

### Compose **with RAG**

**POST** http://localhost:3000/api/gemini-compose-mdb

`   {    "series": "Mega Man",    "scene": "boss",    "mood": "energetic",    "instruments": [{"name":"Square"},{"name":"Triangle"},{"name":"Pulse"}],    "steps": 64,    "tempoBpm": 120,    "barSteps": 16,    "beatsPerBar": 4,    "fillBars": 3,    "fillUniform": true  }   `

**Expect:** retrieved contains Mega Man cues; events feel on-brand at 120 BPM.

### Compose **without RAG** (control)

**POST** http://localhost:3000/api/gemini-compose-mdb

`   {    "series": "Mega Man",    "scene": "boss",    "mood": "energetic",    "useRag": false,    "instruments": [{"name":"Square"},{"name":"Triangle"},{"name":"Pulse"}],    "steps": 64,    "tempoBpm": 120,    "barSteps": 16,    "beatsPerBar": 4,    "fillBars": 3  }   `

**Expect:** retrieved: \[\]; music tends to be more generic vs. RAG-on output.

### Autocomplete (continue after user notes)

Seed with your current grid (example has **C5@0 len16** and **C#5@32 len16**):

`   {    "series": "Mega Man",    "scene": "boss",    "mood": "energetic",    "instruments": [{"name":"Square"},{"name":"Triangle"},{"name":"Pulse"}],    "steps": 64,    "tempoBpm": 120,    "barSteps": 16,    "beatsPerBar": 4,    "fillBars": 3,    "fillUniform": true,    "seed": {      "events": [        { "step": 0,  "instrumentIdx": 0, "note": "C5",  "length": 16 },        { "step": 32, "instrumentIdx": 0, "note": "C#5", "length": 16 }      ]    }  }   `

**Expect:** Response echoes startStep: 48. Returned events\[\].relStep are **relative to 0** and will be placed at startStep + relStep → new notes begin exactly at **48** with **no gap** and fill **3 bars**.

Technical Details
-----------------

*   **Embeddings:** gemini-embedding-001 → 768-dim.
    
*   **DB/Index:** Postgres + **pgvector** (vector(768)), IVFFlat index; cosine distance.
    
*   **RPC:** match\_nes\_chunks(query\_embedding, match\_threshold, match\_count); tunable k and threshold.
    
*   **Model:** gemini-2.5-flash (fast, schema-friendly).
    
*   **Schema:** JSON { events:\[{ relStep, instrumentIdx, note, length }\] }.
    
*   **Tempo/Grid:** tempoBpm, barSteps, beatsPerBar, fillBars, fillUniform.
    
*   **Continuation:** seed.events + startStep → Flash writes **relative** steps; client maps to absolute.
    

Control Knobs
-------------

KnobEffectkIncrease for more diverse references; decrease for purer style.thresholdRaise to filter weak matches; lower to broaden context.barSteps / beatsPerBarDefines the grid; density mapping uses this with tempoBpm.fillBarsForces a clear coverage window (e.g., 3 bars after startStep).fillUniformTiles first-bar motif if the model under-fills.tempoBpmGuides note lengths/density to “feel right”.seed.eventsSends all user notes (we accept step or relStep).startStepWhere continuation begins (server recomputes to be safe).

Why Not Fine-Tune?
------------------

*   **Zero training time**: Swap/update the NES-MDB subset instantly.
    
*   **Explainability**: We can show exactly which tracks influenced the output.
    
*   **Latency/Cost**: Flash + RAG is low-latency and budget-friendly; fine-tuning still benefits from retrieval for coverage.
    

What to Measure
---------------

*   **Acceptance rate** — % generations kept without regen (should ↑).
    
*   **Edit distance** — Edits needed to reach final loop (should ↓).
    
*   **Time-to-first-keeper** — Seconds to usable loop (should ↓).
    
*   **Mean retrieved similarity** — Average similarity of top-K refs (monitor coverage).
    

Prompting Guidelines (for users)
--------------------------------

*   Keep it **short**: _“mega man boss energetic”_, _“castlevania dark castle”_, _“zelda heroic overworld”_.
    
*   Tempo is controlled in the UI; no need to mention BPM or theory words.
    

One-liner Summary
-----------------

> RAG turns Gemini 2.5 Flash from a general composer into a **grounded, NES-aware autocompleter**—short prompts, authentic results, real references, and structured events that drop straight into the sequencer.
## License
MIT (update if different). 
