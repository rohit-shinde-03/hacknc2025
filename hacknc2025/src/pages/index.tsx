import { useCallback, useRef } from "react";
import Block from "@/components/Block";

export default function Home() {
  const toneRef = useRef<any | null>(null);
  const synthRef = useRef<any | null>(null);

  const handleToggle = useCallback((/* row */ _r: number, /* column */ _c: number) => {
    (async () => {
      // Load Tone dynamically (single entry for type safety)
      const mod = await import("tone");
      const ns: any = mod as any;
      const DefaultNS: any = (ns && ns.default) ? ns.default : undefined;
      const GlobalNS: any = (globalThis as any).Tone ?? undefined;

      // Prefer ESM named exports, then default namespace, then global UMD namespace
      const ToneNS: any = (ns && (ns.start || ns.MembraneSynth || ns.Synth)) ? ns
        : (DefaultNS && (DefaultNS.start || DefaultNS.MembraneSynth || DefaultNS.Synth)) ? DefaultNS
        : GlobalNS;

      const MembraneCtorCandidates: any[] = [
        ToneNS?.MembraneSynth,
      ].filter(Boolean);
      const SynthCtorCandidates: any[] = [
        ToneNS?.Synth,
      ].filter(Boolean);
      const start: any = ToneNS?.start;
      const context: any = ToneNS?.context;

      if (typeof start === "function") {
        await start();
      } else if (context && typeof context.resume === "function") {
        await context.resume();
      }

      if (!synthRef.current) {
        const tryConstruct = (candidates: any[]): any | null => {
          for (const c of candidates) {
            try {
              if (typeof c === 'function') {
                const inst = new c();
                return inst;
              }
            } catch (_e) {
              // keep trying
            }
          }
          return null;
        };

        const mem = tryConstruct(MembraneCtorCandidates);
        const basic = mem ? null : tryConstruct(SynthCtorCandidates);

        if (mem) {
          synthRef.current = mem.toDestination();
        } else if (basic) {
          synthRef.current = basic.toDestination();
        } else {
          // Log available keys once to help diagnose
          const keys = ToneNS ? Object.keys(ToneNS) : [];
          console.warn('No constructable Tone synth found on Tone namespace. keys=', keys);
          return;
        }
      }

      synthRef.current.triggerAttackRelease("C3", "8n");
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <Block trackIndex={0} stepIndex={0} isActive={false} onToggle={handleToggle} />
    </div>
  );
}
