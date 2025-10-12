# pip install pretty_midi mido numpy
import pretty_midi as pm
import json, sys, numpy as np, pathlib as p

def estimate_key(notes):
    # crude pitch-class histogram -> key name
    pc = np.zeros(12, dtype=float)
    for n in notes: pc[n % 12] += 1
    names = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"]
    return names[int(pc.argmax())]

def quantize_to_16th(pm_obj, q=16):
    tempo = pm_obj.estimate_tempo()
    step_dur = 60.0/tempo/(q/4.0)  # seconds per 16th
    events = []
    for inst in pm_obj.instruments:
        # Merge: NES-MDB may have multiple melodic tracks; keep all pitched notes
        for note in inst.notes:
            step_on  = int(round(note.start/step_dur))
            step_off = max(step_on+1, int(round(note.end/step_dur)))
            events.append((step_on, note.pitch, step_off-step_on))
    if not events: return tempo, []
    events.sort()
    return tempo, events

def notes_to_style_card(title, game, composer, tempo, notes):
    k = estimate_key([n[1] for n in notes]) if notes else "C"
    low  = min([n[1] for n in notes]) if notes else 60
    high = max([n[1] for n in notes]) if notes else 72
    return {
        "title": title, "game": game, "composer": composer,
        "key": k, "tempo": round(tempo,1),
        "range_midi": [int(low), int(high)],
        "pitch_hist": " ".join(map(str, np.bincount([n[1]%12 for n in notes], minlength=12).tolist()))
    }

def make_motifs(events, bar_steps=16, max_bars=4):
    # emit 1–4 bar snippets (note_list is simple space-separated note names)
    mot = []
    if not events: return mot
    # naive: slice every bar
    last_step = max(s for s,_,_ in events)
    for start in range(0, last_step, bar_steps):
        for bars in range(1, max_bars+1):
            end = start + bars*bar_steps
            seg = [e for e in events if start <= e[0] < end]
            if not seg: continue
            note_names = []
            for s, midi, dur in seg:
                note_names.append(midi_to_name(midi))
            mot.append({
                "start_step": start,
                "bars": bars,
                "note_list": " ".join(note_names[:64]),  # cap
                "token_text": " ".join(note_names[:64])  # you can refine later
            })
    return mot

NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
def midi_to_name(m):
    return f"{NAMES[m%12]}{(m//12)-1}"

def main(in_dir:str, out_jsonl:str):
    out = open(out_jsonl, "w", encoding="utf-8")
    for midi_path in p.Path(in_dir).rglob("*.mid"):
        try:
            m = pm.PrettyMIDI(str(midi_path))
            tempo, events = quantize_to_16th(m, 16)
            style = notes_to_style_card(midi_path.stem, "NES-MDB", "", tempo, events)
            motifs = make_motifs(events, 16, 4)
            row = {
                "title": midi_path.stem,
                "game": "NES-MDB",
                "composer": "",
                "midi_path": str(midi_path),
                "key_est": style["key"],
                "tempo_bpm": style["tempo"],
                "note_min": style["range_midi"][0],
                "note_max": style["range_midi"][1],
                "style_text": (
                    f"{style['title']} | key {style['key']} | tempo {style['tempo']} | "
                    f"range {style['range_midi'][0]}-{style['range_midi'][1]} | "
                    f"pitch_hist {style['pitch_hist']}"
                ),
                "motifs": motifs,
            }
            out.write(json.dumps(row) + "\n")
        }except Exception as e:
            print("skip", midi_path, e, file=sys.stderr)
    out.close()

if __name__ == "__main__":
    # python tools/preprocess_nes_mdb.py /path/to/nes_mdb out.jsonl
    main(sys.argv[1], sys.argv[2])
