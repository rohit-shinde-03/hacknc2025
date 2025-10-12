// src/pages/api/gemini-compose-mdb.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, SchemaType } from "@google/generative-ai";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const genAI = new GoogleGenAI(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);

type Body = {
  prompt: string;
  instruments: { name: string; notes: string[] }[]; // Square/Triangle/Pulse + note ranges in your grid
  userCtxText: string;      // describe last 1–4 bars from user grid as text
  maxEvents?: number;
  kStyle?: number;
  kMotif?: number;
  stepQuant?: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const {
    prompt, instruments, userCtxText,
    maxEvents = 24, kStyle = 6, kMotif = 12, stepQuant = 16
  } = req.body as Body;

  if (!prompt || !instruments?.length) return res.status(400).json({ error: "prompt + instruments required" });

  const embedModel = "text-embedding-004";
  const embed = async (text: string) => {
    const r = await genAI.models.embedContent({ model: embedModel, content: { role: "user", parts: [{ text }] } });
    return r.embedding.values;
  };

  // --- Retrieve style + motifs
  const [qVec, ctxVec] = await Promise.all([embed(prompt), embed(userCtxText || prompt)]);

  // style
  const { data: styleHits, error: e1 } = await supabase
    .rpc("match_mdb_tracks", { query_vec: qVec, match_count: kStyle }); // see SQL RPC below
  if (e1) console.error(e1);

  // motifs
  const { data: motifHits, error: e2 } = await supabase
    .rpc("match_mdb_motifs", { query_vec: ctxVec, match_count: kMotif });
  if (e2) console.error(e2);

  const styleCards = (styleHits || []).map((r: any) => r.style_text).slice(0, kStyle);
  const ctxMotifs  = (motifHits  || []).map((r: any) => r.note_list).slice(0, kMotif);

  // --- Build system + schema for multi-instrument events
  const sys = [
    `You are an NES chiptune composer for a 64-step (16th-note) grid.`,
    `Use ALL instruments. At most one note per instrument per step. Total events ≤ ${maxEvents}.`,
    ...instruments.map(i => `- ${i.name} allowed notes: ${i.notes.join(", ")}`),
    `User context (recent fragment to continue): ${userCtxText || "(none)"}`,
    `Style references (vibes only, do not copy):\n${styleCards.map((s,i)=>`${i+1}. ${s}`).join("\n")}`,
    `Motif references (vibes only, do not copy):\n${ctxMotifs.join(" | ")}`,
    `Avoid reproducing any exact 8+ note run from references; keep novelty.`,
    `Return STRICT JSON.`,
  ].join("\n");

  const schema = {
    type: SchemaType.OBJECT,
    properties: {
      events: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            relStep: { type: SchemaType.INTEGER },       // 0-based
            instrument: { type: SchemaType.STRING, enum: instruments.map(i=>i.name) },
            note: { type: SchemaType.STRING },
            length: { type: SchemaType.INTEGER },        // optional sustain in steps
          },
          required: ["relStep", "instrument", "note"]
        }
      }
    },
    required: ["events"]
  } as const;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: sys + `\n\nUser prompt: """${prompt}"""` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema as any,
      temperature: 0.9,
      topP: 0.9,
    }
  });

  let data: any;
  try { data = JSON.parse(response.text()); }
  catch { return res.status(502).json({ error: "Model JSON parse failed", raw: response.text() }); }

  // Normalize + map instrument -> index
  const nameToIdx = Object.fromEntries(instruments.map((i,ix)=>[i.name.toLowerCase(), ix]));
  const out = (data.events || [])
    .filter((e: any) => Number.isInteger(e?.relStep) && typeof e?.instrument==="string" && typeof e?.note==="string")
    .slice(0, maxEvents)
    .map((e:any)=>({ relStep: e.relStep, instrumentIdx: nameToIdx[e.instrument.toLowerCase()], note: e.note, length: e.length||1 }))
    .filter((e:any)=> e.instrumentIdx != null);

  return res.status(200).json({ events: out });
}
