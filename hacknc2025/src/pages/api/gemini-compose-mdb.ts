import type { NextApiRequest, NextApiResponse } from "next";
import { GoogleGenAI } from "@google/genai";
import { retrieveNESContext } from "@/../utils/rag";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

/** ---------- JSON schema for structured output ---------- **/
const eventsSchema = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          relStep: { type: "integer" },
          instrumentIdx: { type: "integer" },
          note: { type: "string" },
          length: { type: "integer" },
        },
        required: ["relStep", "instrumentIdx", "note", "length"],
      },
    },
  },
  required: ["events"],
} as const;

/** ---------- Simple prompt builder + sanitizer ---------- **/
const moodHints: Record<string, string> = {
  energetic: "driving, upbeat, high energy",
  heroic: "bold, triumphant, adventurous",
  dark: "brooding, tense, minor",
  spooky: "gothic, eerie, repeating pattern",
  dreamy: "soaring, floating, lyrical",
  cheerful: "bright, playful, upbeat",
  mysterious: "subtle, sneaking, low intensity",
};

const sceneHints: Record<string, string> = {
  overworld: "open-field exploration theme",
  boss: "boss battle theme",
  castle: "castle interior theme",
  base: "enemy base infiltration theme",
  town: "peaceful town theme",
  cave: "underground cavern theme",
  space: "space stage theme",
};

function buildSimplePrompt(input?: string, series?: string, scene?: string, mood?: string) {
  if (input && input.trim()) return input.trim();
  const bits = [
    series ? `${series} style` : "",
    scene && sceneHints[scene] ? sceneHints[scene] : "",
    mood && moodHints[mood] ? moodHints[mood] : "",
  ].filter(Boolean);
  return bits.join(", ").trim() || "NES game style exploration theme";
}

function sanitize(text: string) {
  return text
    .replace(/\b\d+\s*bpm\b/gi, "") // drop tempo words
    .replace(/\barp(eggio|egios)?\b/gi, "busy high-note pattern")
    .replace(/\bpedal tone\b/gi, "steady low note")
    .replace(/\bostinato\b/gi, "repeating pattern")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** ---------- Response text extractor (SDK-version safe) ---------- **/
function extractText(r: any): string {
  if (typeof r.text === "function") {
    try { return r.text(); } catch {}
  }
  if (typeof r.outputText === "string") return r.outputText;
  const parts = r?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => p?.text ?? "").join("");
}

/** ---------- Start-step from seed (accepts relStep OR step) ---------- **/
// NEW: accepts either `relStep` OR `step` in the incoming seed array
function computeStartStep(seedEvents?: any[]) {
  if (!Array.isArray(seedEvents) || seedEvents.length === 0) return 0;
  let last = 0;
  for (const e of seedEvents) {
    const base = (e?.relStep ?? e?.step ?? 0) | 0; // NEW
    const len = Math.max(1, Number(e?.length ?? 1) | 0);
    last = Math.max(last, base + len);
  }
  return last;
}

/** ---------- Output sanitizer ---------- **/
function cleanEvents(events: any[], instrumentsLen: number, startStep: number) {
  const cleaned = events.map((e: any) => ({
    relStep: Math.max(0, e?.relStep | 0),
    instrumentIdx: Math.max(0, Math.min(instrumentsLen - 1, e?.instrumentIdx | 0)),
    note: String(e?.note || "C4"),
    length: Math.max(1, e?.length | 0),
  }));
  return cleaned.filter((e) => e.relStep >= startStep);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Inputs (simple UX)
    const series: string | undefined = body?.series;
    const scene: string | undefined = body?.scene;
    const mood: string | undefined = body?.mood;
    const freePrompt: string | undefined = body?.prompt;

    const instruments = Array.isArray(body?.instruments) ? body.instruments : [];
    const steps = Number(body?.steps ?? 64) | 0;
    const maxEvents = Number(body?.maxEvents ?? 48) | 0;

    const seedEvents: any[] | undefined = Array.isArray(body?.seed?.events) ? body.seed.events : undefined;

    // Build prompt
    const simplePrompt = buildSimplePrompt(freePrompt, series, scene, mood);
    const finalPrompt = sanitize(simplePrompt);

    // Compute continuation point
    const computedStart = computeStartStep(seedEvents);
    const startStep: number = Number(body?.startStep ?? computedStart) | 0;

    // NEW: allow defining a fill window (uniform coverage)
    const barSteps = Number(body?.barSteps ?? 16);     // NEW
    const fillBars = Number(body?.fillBars ?? 0);      // NEW: 0 = model decides length
    const endStep = Number(body?.fillToStep ?? (fillBars > 0 ? startStep + fillBars * barSteps : startStep + 9999)); // NEW
    const fillUniform = body?.fillUniform === true;    // NEW

    // Retrieval (toggle)
    const useRag = body?.useRag !== false;
    let matches: any[] = [];
    let contextText = "";
    if (useRag) {
      const r = await retrieveNESContext(finalPrompt, 5, 0.6);
      matches = r.matches ?? [];
      contextText = r.contextText ?? "";
    }

    // Compose prompt
    const system = [
      "You compose NES-style 8-bit patterns for three voices:",
      "Square (lead), Triangle (bass), Pulse (arp/counter).",
      "Honor NES constraints: single-voice polyphony per instrument and chip-friendly pitch ranges.",
      "Quantize to a fixed step grid. The UI controls tempo; do not reference BPM.",
    ].join(" ");

    const userParts: string[] = [
      `User intent: ${finalPrompt}`,
      useRag ? `Retrieved NES-MDB references:\n${contextText}` : `Retrieved NES-MDB references: (disabled)`,
      Array.isArray(seedEvents) && seedEvents.length
        ? `Continue composing AFTER relStep ${startStep}. Do not overlap with existing notes.\nSeed events (existing notes):\n${JSON.stringify(seedEvents).slice(0, 4000)}`
        : `No existing notes. Compose a new set.`,
      `Output up to ${maxEvents} events as JSON with fields {relStep, instrumentIdx, note, length}.`,
      `Start at relStep 0 (this maps to absolute step ${startStep} in the user's grid).`,
      `All relStep values in your JSON MUST be RELATIVE to this 0 start (do not output absolute steps).`,
      `Instrument map: ${instruments.map((i: any, idx: number) => `[${idx}] ${i?.name ?? "Inst"+idx}`).join(", ")}`
    ];
    // NEW: tempo + grid guidance
    const tempoBpm = Number(body?.tempoBpm ?? 120);
    const beatsPerBar = Number(body?.beatsPerBar ?? 4);
    const stepsPerBeat = Math.max(1, Math.floor(barSteps / beatsPerBar));

    // …then push these to userParts (after the “start at relStep 0” lines)
    userParts.push(
      `Assume tempo ${tempoBpm} BPM.`,
      `Treat 1 step as a ${Math.round(4 / stepsPerBeat)}th-note at this tempo (with ${barSteps} steps per bar, ${beatsPerBar} beats per bar).`,
      `At ${tempoBpm} BPM, keep densities typical: Square (lead) mostly 1–2 steps, Triangle (bass) 2–4 steps, Pulse (arp) 1-step runs.`
    );


    // Call Gemini 2.5 Flash with structured output
    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: system }, { text: userParts.join("\n") }] }],
      // genai SDK: structured-output settings live under `config`
      // @ts-ignore
      config: { responseMimeType: "application/json", responseSchema: eventsSchema },
    });

    // Parse
    const txt = extractText(result);
    const parsed = txt ? JSON.parse(txt) : { events: [] };
    const events = Array.isArray(parsed?.events) ? parsed.events : [];

    // Clean + clamp to window
    let cleaned = cleanEvents(events, instruments.length || 3, startStep);
    cleaned = cleaned.filter((e) => e.relStep < endStep);

    // NEW: Optional uniform tiling if the model under-fills the first bar
    if (fillUniform && cleaned.length > 0) {
      const motifLen = barSteps;
      const motif = cleaned
        .filter((e) => e.relStep < startStep + motifLen)
        .map((e) => ({ ...e }));
      let offset = startStep + motifLen;
      while (offset < endStep) {
        cleaned.push(...motif.map((e) => ({ ...e, relStep: e.relStep - startStep + offset })));
        offset += motifLen;
      }
      cleaned = cleaned.filter((e) => e.relStep < endStep);
    }
    if (cleaned.length > 0) {
      const minRel = Math.min(...cleaned.map(e => e.relStep | 0));
      if (minRel >= startStep) {
        cleaned = cleaned.map(e => ({ ...e, relStep: (e.relStep | 0) - startStep }));
      }
    }
    return res.status(200).json({
      events: cleaned,
      retrieved: matches?.slice?.(0, 3) || [],
      usedPrompt: finalPrompt,
      startStep,
      endStep, // NEW: helpful in the UI
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
  }
}
