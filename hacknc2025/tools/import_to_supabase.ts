// npm i @supabase/supabase-js @google/genai
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY });

async function embed(text: string): Promise<number[]> {
  const r = await ai.models.embedContent({
    model: "text-embedding-004",
    content: { role: "user", parts: [{ text }] },
  });
  return r.embedding.values; // float[]
}

async function run(jsonlPath: string) {
  const lines = fs.readFileSync(jsonlPath, "utf-8").trim().split("\n");
  for (const line of lines) {
    const row = JSON.parse(line);
    const { data: trackIns, error: e1 } = await supabase
      .from("mdb_tracks")
      .insert({
        title: row.title, game: row.game, composer: row.composer,
        midi_url: row.midi_path, key_est: row.key_est, tempo_bpm: row.tempo_bpm,
        note_min: row.note_min, note_max: row.note_max,
        style_text: row.style_text,
      })
      .select("id")
      .single();
    if (e1) { console.error("insert track", e1); continue; }

    const styleVec = await embed(row.style_text);
    await supabase.from("mdb_tracks").update({ style_embedding: styleVec }).eq("id", trackIns.id);

    // motifs
    for (const m of row.motifs as any[]) {
      const motifVec = await embed(m.note_list);
      await supabase.from("mdb_motifs").insert({
        track_id: trackIns.id,
        bars: m.bars,
        start_step: m.start_step,
        token_text: m.token_text,
        note_list: m.note_list,
        motif_embedding: motifVec,
      });
    }
    console.log("imported", row.title);
  }
}

run(process.argv[2]).catch(console.error);
