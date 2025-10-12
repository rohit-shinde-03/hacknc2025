// Accepts number[] or Float32Array safely
export function sampleTopP(
  logitsLike: ArrayLike<number>,
  topP = 0.95,
  temperature = 1.0
): number {
  const arr = Array.from(logitsLike as ArrayLike<number>); // normalize to number[]
  const t = Math.max(1e-8, temperature);

  // temperature scale
  const scaled = arr.map(v => v / t);
  const maxLogit = Math.max(...scaled);
  const exps = scaled.map(v => Math.exp(v - maxLogit));
  const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
  const probs = exps.map(v => v / sumExp);

  // index + sort by prob desc (use objects, not tuples, to avoid destructuring issues)
  const indexed = probs.map((p, i) => ({ i, p })).sort((a, b) => b.p - a.p);

  // keep smallest set whose cumulative prob >= topP
  let cum = 0;
  const kept: Array<{ i: number; p: number }> = [];
  for (const it of indexed) {
    kept.push(it);
    cum += it.p;
    if (cum >= topP) break;
  }

  const keptSum = kept.reduce((a, b) => a + b.p, 0) || 1;

  // sample within kept
  const r = Math.random();
  let acc = 0;
  for (const { i, p } of kept) {
    acc += p / keptSum;
    if (r <= acc) return i;
  }
  // fallback
  return kept[0]?.i ?? 0;
}
