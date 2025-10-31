// Load env FIRST
import path from "path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

import * as tar from "tar";
import { GoogleGenAI } from "@google/genai";
import supabaseAdmin from "../utils/supabaseAdmin";

const DIM = Number(process.env.EMBEDDING_DIM || 768);
const TAR_PATH = process.argv[2] || "./data/nesmdb_midi.tar";
const LIMIT = Number(process.env.INGEST_LIMIT || 800); // quick demo; remove to ingest all
const BATCH = Number(process.env.INGEST_BATCH || 80);  // keep modest to avoid rate issues

type Row = {
  game: string;
  track: string;
  split: string;
  url: string | null;
  summary: string;
  metadata: any;
  embedding?: number[];
};

function parseName(p: string): Row | null {
  // Example: nesmdb_midi/train/058_Contra_00_01ContraTitle.mid
  const m = /nesmdb_midi\/(train|test|valid)\/\d+_([^_]+)_.+?_(.+)\.mid$/i.exec(p);
  if (!m) return null;
  const split = m[1];
  const game = m[2].replace(/-/g, " ").trim();
  const track = m[3].replace(/[_-]+/g, " ").trim();
  const summary = `${game} — ${track}. NES chiptune: square lead, triangle bass, pulse arps.`;
  return { game, track, split, url: null, summary, metadata: { path: p } };
}

async function embedBatch(genai: GoogleGenAI, texts: string[]) {
  // Batch embed via 'contents: string[]'
  const resp = await genai.models.embedContent({
    model: "gemini-embedding-001",
    contents: texts,
    // @ts-ignore keep compatibility; some versions require config wrapper
    config: { outputDimensionality: DIM },
  });
  const arr = resp.embeddings ?? [];
  return arr.map((e: any) => (e?.values ?? []) as number[]);
}

async function run() {
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // Collect filenames from tar without extracting
  const files: string[] = [];
  await tar.list({
    file: TAR_PATH,
    onentry: (e: any) => {
      if (e.type === "File" && e.path.endsWith(".mid")) files.push(e.path);
    },
  });

  const rows: Row[] = [];
  for (const f of files) {
    const r = parseName(f);
    if (r) rows.push(r);
    if (rows.length >= LIMIT) break;
  }
  console.log(`Parsed ${rows.length} items from ${TAR_PATH}`);

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const vecs = await embedBatch(genai, chunk.map((r) => r.summary));
    const payload = chunk.map((r, j) => ({ ...r, embedding: vecs[j] }));

    const { error } = await supabaseAdmin.from("nes_chunks").upsert(payload);
    if (error) throw error;
    console.log(`Upserted ${i + chunk.length}/${rows.length}`);
  }
  console.log("Done.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
