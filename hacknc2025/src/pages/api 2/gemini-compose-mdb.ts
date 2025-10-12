import type { NextApiRequest, NextApiResponse } from "next";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Shape of the request your page sends
type ReqBody = {
  prompt: string;
  instruments: Array<{ name: string; notes: string[] }>;
  maxEvents?: number;
  stepQuant?: number;
  maxPolyphony?: number;
};

// Shape of the response index.tsx expects
type EventItem = {
  relStep: number;          // relative step offset (>= 0)
  instrumentIdx: number;    // which instrument
  note: string;             // note name, e.g. "C4"
  length?: number;          // optional step length
};

type ResBody = { events: EventItem[] };

// If you already have a Python/RAG service you proxy to, swap this function
// to do a `fetch(process.env.RAG_SERVER_URL!, { ... })` and return its JSON.
async function composeWithRAGLLM(
  prompt: string,
  instruments: Array<{ name: string; notes: string[] }>,
  maxEvents: number,
  stepQuant: number,
  maxPolyphony: number
): Promise<EventItem[]> {
  // Minimal LLM wiring (keep existing env var name)
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY/GOOGLE_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Few-shot format: we ask for strict JSON with our fields
  const sys =
    "You are a chiptune arranger. Return ONLY JSON with an 'events' array. " +
    "Each event has relStep (non-negative integer), instrumentIdx (int), note (string like C4), and optional length (steps). " +
    `Limit to <= ${maxEvents} events, step quant ${stepQuant}, max polyphony ${maxPolyphony}. ` +
    "Only use notes provided per instrument. Never exceed array bounds.";

  const instrumentCatalog = instruments
    .map((inst, idx) => {
      const notesJoined = inst.notes.map((n: string, i: number) => `${i}:${n}`).join(", ");
      return `#${idx} ${inst.name}: [${notesJoined}]`;
    })
    .join("\n");

  const content = [
    { role: "user", parts: [{ text: sys }] },
    {
      role: "user",
      parts: [
        {
          text:
            `PROMPT: ${prompt}\n\nINSTRUMENTS (index:name:notes[idx]):\n` +
            instrumentCatalog +
            `\n\nReturn strictly:\n{"events":[{"relStep":0,"instrumentIdx":0,"note":"C4","length":2}, ...]}\n`,
        },
      ],
    },
  ];

  const resp = await model.generateContent({ contents: content as any });
  const txt = resp.response.text().trim();

  // Try parse strict JSON (strip backticks or fencing if present)
  const jsonText = txt.replace(/^```json\s*|\s*```$/g, "");
  let parsed: ResBody | null = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // As a last resort, try to find the first {...} block
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }
  if (!parsed || !Array.isArray(parsed.events)) {
    throw new Error("LLM did not return valid events JSON");
  }

  // Coerce types & clamp
  const events: EventItem[] = parsed.events.map((e) => ({
    relStep: Math.max(0, Number.isFinite(e.relStep as number) ? (e.relStep as number) : 0),
    instrumentIdx: Math.max(0, Number.isFinite(e.instrumentIdx as number) ? (e.instrumentIdx as number) : 0),
    note: String(e.note || "C4"),
    length: Number.isFinite(e.length as number) ? (e.length as number) : undefined,
  }));
  return events.slice(0, maxEvents);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResBody | { error: string }>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const {
      prompt,
      instruments,
      maxEvents = 24,
      stepQuant = 16,
      maxPolyphony = 3,
    } = (req.body || {}) as ReqBody;

    if (!prompt || !Array.isArray(instruments)) {
      return res.status(400).json({ error: "Bad request: prompt + instruments required" });
    }

    const events = await composeWithRAGLLM(
      prompt,
      instruments,
      maxEvents,
      stepQuant,
      maxPolyphony
    );
    return res.status(200).json({ events });
  } catch (err: any) {
    console.error("gemini-compose-mdb error:", err?.stack || err);
    return res.status(500).json({ error: "Server error" });
  }
}
