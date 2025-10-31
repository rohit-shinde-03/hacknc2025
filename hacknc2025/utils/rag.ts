import { GoogleGenAI } from "@google/genai";
import supabaseAdmin from "./supabaseAdmin";

const DIM = Number(process.env.EMBEDDING_DIM || 768);
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function retrieveNESContext(
  userQuery: string,
  k = 5,
  threshold = 0.6
) {
  // Batch API also exists, but a single text is fine:
  const resp = await genai.models.embedContent({
    model: "gemini-embedding-001",
    contents: String(userQuery),
    // Some SDK versions require config-wrapper for outputDim:
    // @ts-ignore - keep compatible across minor versions
    config: { outputDimensionality: DIM },
  });

  const queryEmbedding = (resp.embeddings?.[0]?.values ?? []) as number[];
  if (!queryEmbedding.length) throw new Error("Embedding failed for query.");

  const { data, error } = await supabaseAdmin.rpc("match_nes_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: k,
  });
  if (error) throw error;

  const contextText = (data ?? [])
    .map((d: any, i: number) => `[${i + 1}] ${d.game} — ${d.track}: ${d.summary}`)
    .join("\n");

  return { matches: data ?? [], contextText };
}
