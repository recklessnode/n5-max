# N5 MAX · M.2 telemetry viz

Stylized motherboard schematic + 1 Hz playback.

- **CELL1 single** (default when pack present): `stage1-single-full` pack under `data/cell1-single/` — **CELL1 · single · provisional**, not story-sealed.
- **Calibration**: Protocol B `stage1-raidz2-calibrate` pack under `data/calibration/` — **CALIBRATE · provisional · shape/DEMO only**.
- **Simulator (Stage 1)**: pick any layout × primarycache cell via `data/stage1/catalog.json` — **SIM · provisional · shape/DEMO only** (not story-sealed). Cell0/1 alias existing calibrate/cell1 packs.
- **DEMO**: synthetic playlist fallback (`js/demoTelemetry.js`).

Schema: lab `docs/result-schema.md`. Column map: `ADAPTER.md`.

Rebuild packs:

```bash
# calibrate (defaults)
python3 scripts/build-calibration-pack.py

# cell1 single
python3 scripts/build-calibration-pack.py \
  --result-dir results/2026-09-11-20.54-storage.dendrite-sut \
  --out site/telemetry-viz/data/cell1-single \
  --profile cell1-single

# Stage 1 Simulator cell (example)
python3 scripts/build-calibration-pack.py \
  --result-dir results/2026-09-11-22.02-storage.dendrite-sut \
  --out site/telemetry-viz/data/stage1/cell2-raid0-none \
  --profile stage1
```
