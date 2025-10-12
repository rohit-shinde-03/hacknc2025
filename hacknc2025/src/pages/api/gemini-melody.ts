// src/pages/api/gemini-melody.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
});

type Body = {
  prompt: string;
  instruments: { name: string; notes: string[] }[];
  maxEvents?: number;      // cap total events (e.g., 16–32)
  stepQuant?: number;      // 16th-note grid
  maxPolyphony?: number;   // max notes per step overall (e.g., 3)
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const {
    prompt,
    instruments,
    maxEvents = 24,
    stepQuant = 16,
    maxPolyphony = 3,
  } = (req.body || {}) as Body;

  if (!prompt || !Array.isArray(instruments) || instruments.length === 0) {
    return res.status(400).json({ error: "prompt and instruments[] required" });
  }

  const names = instruments.map(i => i.name);
  const nameToIdx = Object.fromEntries(names.map((n, i) => [n.toLowerCase(), i]));

  // JSON schema for strict structured output
  const responseSchema = {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            relStep: { type: "integer", minimum: 0 },       // column offset from start
            instrument: { type: "string", enum: names },    // one of ["Square","Triangle","Pulse"]
            note: { type: "string" },                       // e.g. "E4"
            length: { type: "integer", minimum: 1, maximum: 8 } // optional sustain in steps
          },
          required: ["relStep", "instrument", "note"],
        },
      },
    },
    required: ["events"],
  } as const;

  const sysLines = [
    `You are an NES-style chiptune composer for a 64-step (16th-note) grid.`,
    `Use ALL instruments across the sequence:`,
    ...instruments.map(i => `- ${i.name}: allowed notes -> ${i.notes.join(", ")}`),
    `Constraints:`,
    `- Quantize strictly to ${stepQuant}th notes (grid columns).`,
    `- Use at most ${maxEvents} total events.`,
    `- Max polyphony per column: ${maxPolyphony} (at most one note per instrument per column).`,
    `- Include at least one event for EACH instrument.`,
    `- Compose “in the style of” without reproducing any copyrighted melody verbatim.`,
    `- Return STRICT JSON only that matches the schema.`,
  ].join("\n");

  const user = `User prompt: """${prompt}"""`;

  try {
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${sysLines}\n\n${user}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema as any,
        temperature: 0.9,
        top_p: 0.9,
      },
    });

    const text = resp.text;
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "Model did not return valid JSON", raw: text });
    }

    if (!parsed || !Array.isArray(parsed.events)) {
      return res.status(502).json({ error: "JSON missing events[]", raw: parsed });
    }

    // Normalize + light validation
    type Ev = { relStep: number; instrument: string; note: string; length?: number };
    const events: Ev[] = parsed.events
      .filter((e: any) =>
        Number.isInteger(e?.relStep) &&
        typeof e?.instrument === "string" &&
        typeof e?.note === "string"
      )
      .slice(0, maxEvents)
      .sort((a: Ev, b: Ev) => a.relStep - b.relStep);

    // Deduplicate per (relStep, instrument)
    const keyset = new Set<string>();
    const dedup: Ev[] = [];
    for (const e of events) {
      const key = `${e.relStep}|${e.instrument.toLowerCase()}`;
      if (!keyset.has(key)) { keyset.add(key); dedup.push(e); }
    }

    // Map to instrumentIdx; discard unknown instruments
    const normalized = dedup
      .map(e => {
        const idx = nameToIdx[e.instrument.toLowerCase()];
        return (idx == null) ? null : { relStep: e.relStep, instrumentIdx: idx, note: e.note, length: e.length ?? 1 };
      })
      .filter(Boolean) as { relStep: number; instrumentIdx: number; note: string; length: number }[];

    return res.status(200).json({ events: normalized });
  } catch (e: any) {
    console.error("gemini-melody server error:", {
      name: e?.name, status: e?.status, message: e?.message, cause: e?.cause,
    });
    return res.status(e?.status || 500).json({ error: "Gemini request failed" });
  }
}
