import type { NextApiRequest, NextApiResponse } from "next";
const PY_URL = process.env.PREDICT_URL || "http://127.0.0.1:8000/predict";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const input_ids: number[] = body?.input_ids;
    if (!Array.isArray(input_ids) || input_ids.length === 0) {
      return res.status(400).json({ error: "Missing input_ids[]" });
    }

    // Proxy to Python server
    const upstream = await fetch(PY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input_ids }),
    });

    const text = await upstream.text();

    // Log so you can see what came back in your Next.js dev console
    console.log("[predict-next-note] PY_URL:", PY_URL, "status:", upstream.status, "body:", text.slice(0, 300));

    // Forward status + body transparently
    res.status(upstream.status).send(text);
  } catch (e: any) {
    console.error("[predict-next-note] error:", e);
    res.status(500).json({ error: e?.message || "server error" });
  }
}
