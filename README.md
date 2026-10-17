# N5 MAX — public report site

Public face for **Minisforum N5 MAX** local-AI NAS benchmark reporting (storage layouts + AI destination story).

- **Live site:** https://recklessnode.github.io/n5-max/
- **Status:** final campaign data (2026-10-08). Stages 1–7 are sealed and stage 8 (write-hole) was deferred. The editorial seal (`story_sealed`) is pending the Publisher gate.
- **Final report:** [`/report/`](https://recklessnode.github.io/n5-max/report/) (self-contained HTML + [PDF](https://recklessnode.github.io/n5-max/report/N5-MAX-final-report.pdf) + chart SVG/PNG under `report/charts/`).
- **Source of truth:** reviewed result artifacts promoted from a private lab notebook. This repo holds **allowlisted site content only** (HTML/CSS/JS/media). Harness, raw campaign logs, and lab docs are not published here.

## What you will find

- Results organised by use case (local AI and RAG, AI + VM server, media archive, models larger than memory), each with a recommended configuration backed by sealed figures, plus a read-only layout explorer and a **Not measured** list
- Live **campaign matrix** at [`/matrix/`](https://recklessnode.github.io/n5-max/matrix/) — status and timestamps only (not a sealed story)
- Telemetry viz labeled **DEMO** / provisional (synthetic until reviewed)
- Media approved for public Pages (no full drive serials)

## How the results page is built

`index.html` is generated, not hand-edited: `python3 scripts/site/build.py` reads `data/sealed-metrics.json`
and writes the page. Every figure is a lookup that names its source key (hover a number to see it), and the
charts are fed from the same lookups. `python3 scripts/site/test_site.py` checks that every number and chart
point resolves to the data, that the layout explorer only offers tested configurations, and (in headless
Chrome) that no chart value can be changed from the page. The same checks run in `.github/workflows/site-checks.yml`.

## Promoting updates

Reviewed site content is promoted into this repository’s root (so GitHub Pages serves `/`). A Publisher reviews each promote PR before merge.

## License / citation

Cite the final report. Non-steady and PROVISIONAL figures are labelled where they appear. Items under “Not yet measured” have no sealed data.
