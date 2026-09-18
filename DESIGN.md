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
- **Intel One Mono** — measured / provisional numerals, chips, axis ticks, amplification bars, `code`/`pre`/`kbd`, case IDs, SN/seat labels, Matrix timestamps, telemetry readouts. Self-hosted woff2 under `fonts/intel-one-mono/` (SIL Open Font License; see `OFL.txt` there). Numbers never share the UI sans.

## Structure

1. Sticky minimal section nav (optional aid; not a product chrome).
2. Hero: eyebrow → colorized title → subtitle → mono chips → provisional badge → four metric cards with winner-colored top rules.
3. Narrative sections in scroll order matching the artifact: Tradeoff → Platform/PCIe → Throughput & IOPS → Physical rail → Compression → Ablation → Baseline → Verdict dual cards → Provenance.
4. Charts use Chart.js grouped bars with orange/teal (or algo colors for compression). Write amp is a custom CSS bar with a dashed **1×** reference — more tactile than a third chart type.
5. Verdict is two peer cards (not a single winner) — “pick by workload.”

## Motion

Subtle fade/translate on scroll via `.reveal`. Fully disabled under `prefers-reduced-motion`. Chart animation follows the same preference.

## Constraints honored

- Exact numbers only from reviewed campaign artifacts (no invented figures).
- No invented AI inference benchmarks; “AI” only as Ryzen AI MAX+ platform name.
- Works at ~1280px; stacks cleanly below 960 / 640.
- Badge: provisional / under review until Protocol B seal.


## Themes (light + dark)

Shared tokens live in `css/theme.css`. Toggle in `js/theme.js` (localStorage key `n5-theme`).

| Mode | Source of truth | Feel |
|------|-----------------|------|
| **Light** | Story / Matrix editorial (`:root`) | Stone wash `#f4f1ec`, ink type, white surfaces |
| **Dark** | M.2 lab charcoal + teal (`[data-theme="dark"]`) | `#0e1114` field, `#151a1f` panels, teal `#2dd4bf` |

- RAID10 orange (`#E86A2B`) and RAIDZ1 teal stay in both modes (teal brightens to lab `#2dd4bf` in dark).
- Include `theme.css` before page CSS; run `theme.js` early in `<head>` (not deferred) to avoid flash.
- Lab aliases (`--bg-panel`, `--text`, `--teal`, …) map onto the shared tokens so `telemetry-viz` keeps its look in dark and gains a working light mode.
- Shared chrome: provisional banner + `.site-nav` + Light/Dark toggle on Story, Matrix, and M.2 lab.
- Default when unset: `prefers-color-scheme`, then light.
