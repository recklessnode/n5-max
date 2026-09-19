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

## 2026-09-18 sealed rearrange

- IA: Overview / Compare / Recipes / Method / Matrix / AI provisional.
- Charts: static SVG under `media/charts/` + Chart.js radar/small-multiples from `data/sealed-metrics.json`.
- Dual answer: btrfs-raid5 fastest measured · raidz1 recommended default.
- HOLD mdadm 8× claim; `story_sealed` remains false; provisional banner stays.
- Design Exploration: composition pass welcome on the PR branch.

## Composition pass (Design Exploration, 2026-09-18)

- Figcaptions stay **Ubuntu** (editorial); measured digits / IDs / axis ticks use **Intel One Mono**.
- Dual-answer cards: equal visual weight; tabular nums on the big metrics.
- Chart mosaic: consistent card chrome; dark theme dims matplotlib SVG wells (light fills) instead of flashing white.
- Chart.js defaults pointed at self-hosted `"Intel One Mono"` for ticks; titles remain Ubuntu.
- No number changes — sealed JSON / SVG payloads untouched.


## Interactive compare v2 (2026-09-18)

- Sealed pages do not load `app.js`; `sealed.css` overrides `.reveal` to visible so sections are not blank.
- Compare: dual picker + metric weight sliders + cold-default filter from `sealed-metrics.json` (`js/interactive-compare.js`).
- Recipes: RAG + AI/VM(+unmeasured cold SATA) + By OS/NAS stack; write-hole flagged not crash-injected.
- SuperGrok second-pass prompt stays lab-only (not linked from public Follow; Pages would ship the whole tree).

## Chart lightbox (2026-09-18)

- Sealed index: click Chart.js canvases (`chart-radar`, `chart-smallmultiples`, `ix-radar`, `.chart-panel canvas`) or SVG/PNG inside `.chart-card` to open a near-fullscreen lightbox.
- Implementation: `js/chart-lightbox.js` + rules in `css/sealed.css`. Canvas snapshots via Chart.js `toBase64Image` / `canvas.toDataURL` (original chart untouched). Static figures reuse `src` + figcaption title.
- Dismiss: ESC or backdrop click; `role=dialog` / `aria-modal` with focus restore. Theme tokens follow `theme.css` / `data-theme`.
