import type { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";

type ReqBody = {
  matrix: boolean[][];
};

type ResBody = {
  suggestions: boolean[][];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResBody | { error: string }>
) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = req.body as ReqBody;
  if (!body || !Array.isArray(body.matrix)) {
    return res.status(400).json({ error: "Invalid body: expected { matrix: boolean[][] }" });
  }

  const scriptPath = process.env.ML_SUGGEST_PATH ?? 
    "/Users/joshchen/Desktop/comp_projects/hacknc2025/ml_service/suggest.py";

  try {
    const child = spawn("python3", [scriptPath]);

    const input = JSON.stringify({ matrix: body.matrix });
    child.stdin.write(input);
    child.stdin.end();

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));

    child.on("close", (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: err || `Process exited with code ${code}` });
      }
      try {
        const parsed = JSON.parse(out);
        return res.status(200).json({ suggestions: parsed.suggestions ?? [] });
      } catch (e) {
        return res.status(500).json({ error: "Invalid JSON from ML process" });
      }
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to spawn ML process" });
  }
}


