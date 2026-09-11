# Design notes — N5 MAX RAID10 vs RAIDZ1

## Direction

Elevate the Claude artifact screenshot language into a **light editorial** report: soft stone field, ink type, generous whitespace, and a clear dual-color identity for the two layouts.

## Palette

| Token | Hex | Role |
|-------|-----|------|
| Stone background | `#f4f1ec` | Page wash; warm, paper-like |
| Surface | `#ffffff` | Cards / panels |
| Ink | `#1a1917` | Primary text |
| Muted | `#6b665e` | Secondary copy |
| **RAID10** | `#E86A2B` | Warm orange — random-write / mirror story |
| **RAIDZ1** | `#1FA6A0` | Teal — capacity / low amp / seq-read story |

Soft radial washes of orange and teal sit behind the hero so the tradeoff is felt before it is read.

## Typography

- **Ubuntu** — body / UI / captions (site go-to sans).
- **Orbitron** — display / tech: hero titles, section heads, eyebrows where a board-lab tone helps (don’t paint everything Orbitron).
- **JetBrains Mono** — measured / sealed numerals, chips, axis ticks, amplification bars. Numbers never share the UI sans.

## Structure

1. Sticky minimal section nav (optional aid; not a product chrome).
2. Hero: eyebrow → colorized title → subtitle → mono chips → sealed badge → four metric cards with winner-colored top rules.
3. Narrative sections in scroll order matching the artifact: Tradeoff → Platform/PCIe → Throughput & IOPS → Physical rail → Compression → Ablation → Baseline → Verdict dual cards → Provenance.
4. Charts use Chart.js grouped bars with orange/teal (or algo colors for compression). Write amp is a custom CSS bar with a dashed **1×** reference — more tactile than a third chart type.
5. Verdict is two peer cards (not a single winner) — “pick by workload.”

## Motion

Subtle fade/translate on scroll via `.reveal`. Fully disabled under `prefers-reduced-motion`. Chart animation follows the same preference.

## Constraints honored

- Exact numbers only from `n5-max-artifact.md` / sealed campaign.
- No invented AI inference benchmarks; “AI” only as Ryzen AI MAX+ platform name.
- Works at ~1280px; stacks cleanly below 960 / 640.
- Badge: “Computed from sealed result.json.”
