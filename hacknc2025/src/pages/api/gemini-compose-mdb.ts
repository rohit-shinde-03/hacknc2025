// export const runtime = "nodejs"; // if you need to force node

import type { NextApiRequest, NextApiResponse } from "next";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const {
      prompt,
      instruments,
      steps = 64,
      startStep = 0,
      seed = { events: [] as Array<{ step: number; instrumentIdx: number; note: string; length: number }> },
      maxEvents = 48,
      stepQuant = 16,
      maxPolyphony = 3,
    } = req.body || {};

    if (!prompt || !Array.isArray(instruments)) {
      return res.status(400).json({ error: "Bad request: prompt + instruments required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const rules = `
You are continuing a chiptune (8-bit) loop on a 0..${steps - 1} step grid (quarters subdivided into ${stepQuant}/step).
Input includes EXISTING note events as absolute steps and a startStep where continuation should begin.
CONSTRAINTS:
- Do NOT modify or re-output existing notes. Only output NEW notes that start at or after startStep.
- Return events with "relStep" measured from startStep (relStep >= 0).
- Use all three instruments when musically appropriate: Square=lead/melody, Triangle=bass, Pulse=arp/chords/counter.
- Keep polyphony per step ≤ ${maxPolyphony}; avoid long unisons across instruments.
- Vary rhythm (don’t place everything on the same row/step); use chord tones relative to existing material.
OUTPUT: Only JSON of the form:
{ "events": [ { "relStep": number, "instrumentIdx": number, "note": string, "length": number }, ... ] }
`;

    const input = {
      prompt,
      instruments,
      steps,
      startStep,
      seed, // existing content
      maxEvents,
      stepQuant,
      maxPolyphony,
    };

    const resp = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: rules },
            { text: `Prompt: ${prompt}` },
            { text: `Instruments: ${JSON.stringify(instruments)}` },
            { text: `steps=${steps}, startStep=${startStep}, stepQuant=${stepQuant}` },
            { text: `Existing events (absolute steps): ${JSON.stringify(seed.events || [])}` },
            { text: `Return at most ${maxEvents} new events.` },
          ],
        },
      ],
    });

    const text = resp.response.text() || "";

    // Try to extract a JSON block
    const match = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[1] || match[0]) : JSON.parse(text);

    // sanitize
    const events: Array<{ relStep: number; instrumentIdx: number; note: string; length: number }> =
      Array.isArray(parsed?.events) ? parsed.events : [];

    const q = Math.max(1, stepQuant | 0);
    const cleaned = events.slice(0, maxEvents).map((e) => ({
      relStep: Math.max(0, Math.round((e.relStep ?? 0) / 1) ), // keep integer
      instrumentIdx: Math.max(0, Math.min(instruments.length - 1, e.instrumentIdx | 0)),
      note: String(e.note || "C4"),
      length: Math.max(1, e.length | 0),
    }));

    return res.status(200).json({ events: cleaned });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({
      error: "Server error",
      detail: String(err?.message || err),
    });
  }
}
