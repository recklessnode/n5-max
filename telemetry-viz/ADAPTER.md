# Telemetry adapter — N5 MAX M.2 viz

**Status:** two sealed-cell packs + DEMO fallback.

| Source | Path | Badge | Default |
|---|---|---|---|
| **CELL1 single** | `data/cell1-single/` from `2026-09-11-20.54-storage.dendrite-sut` (`mode=full`, `layout=stage1-single-full`) | **CELL1 · single · provisional** | **yes** (when pack present) |
| **Calibrate** | `data/calibration/` from `2026-09-11-19.41-storage.dendrite-sut` (`mode=calibrate`, `layout=stage1-raidz2-calibrate`) | **CALIBRATE · provisional** | toggle |
| **Simulator (Stage 1)** | `data/stage1/` + `catalog.json` (cells 0–12; cell0/1 alias calibrate/cell1) | **SIM · … · provisional** | toggle + cell chip grid |
| **DEMO** | `js/demoTelemetry.js` | **DEMO · provisional** | fallback |

**Playback role:** **shape / DEMO only** — **not story-sealed**. Cell1 steadiness is incomplete; do not claim a story promote. Calibrate is **not** the public RAID10/RAIDZ1 chapter.

**Policy:** do **not** ingest in-flight STO slices — cell seal only.

**Schema:** field meanings follow lab `docs/result-schema.md`. Packs are sanitized projections (SN labels only).

---

## Target model (post-normalize)

```ts
{
  t: number,                    // seconds from chapter start (1 Hz ticks)
  drives: [{
    role: string,               // os-x4 | face3-mid | face3-low | opp-a | opp-b
    serialSuffix: string,       // SN1..SN4 | OSDISK — never full disk paths on public Pages
    serialFull?: string,        // optional; public Pages MUST NOT render
    tempC: number,
    readGBs: number,
    writeGBs: number,
    active: boolean             // only activeRoles glow / count toward nActive
  }],
  pool: { readGBs: number, writeGBs: number },  // sum of active member rails
  meta: {
    demo?: boolean,
    calibrate?: boolean,
    cell1?: boolean,
    provisional?: boolean,
    storySealed?: boolean,      // always false for these packs
    testName?: string,
    layout?: string,
    headline?: string,
    playlistId?: string,
    nActive?: number,           // 1 for cell1 · 4 for calibrate
    playbackBadge?: string,
    protocol?: string,
    sourceCell?: string
  }
}
```

API: `normalizeSample(raw)` → model above (`js/normalize.js`).
Pack loader: `N5Calibration.loadPack(base)` / `chapterRun()` (`js/calibrationLoader.js`).
Bases: `N5Calibration.PACKS.cell1` · `N5Calibration.PACKS.calibrate` · `N5Calibration.PACKS.stage1` (+ `loadCatalog()`).

---

## result.json (schema-aligned)

Canonical table: `docs/result-schema.md`. Viz-relevant top-level keys used by the pack:

| key | example | viz use |
|---|---|---|
| `host` | `sut` (redacted) | meta |
| `suite` / `mode` | `storage` / `full` or `calibrate` | badge + filter |
| `layout` | `stage1-single-full` / `stage1-raidz2-calibrate` | HUD |
| `ceiling_gbps` / `ceiling_members` | `1.97` / `1` (cell1) · `7.88` / `4` (cal) | context |
| `members[]` | SN-labelled links | seats; **public omits** raw `member` paths |
| `vdevs[]` | `disk` / `raidz2-0` | topology chip |
| `params.protocol` | B-derived-durations | HUD / notes |
| `tests.<case>.read_gbps` / `write_gbps` | fio window logical | chapter footnotes |
| `tests.<case>.rails.pool_*_gbps` | physical rail | chapter headlines (prefer matching rw) |
| `tests.<case>.rails.steadiness` | plateau proof | optional HUD (incomplete ⇒ provisional) |
| `tests.<case>.thermal` | — | **cell 2+** when present |

Labels: drives are **SN1..SN4** (`campaign/topology-4wide.json` maps label → nvme → PCI/root port).
Deprecated protocol-A runs must not be charted.

---

## Real sampler CSV column map (cell seal)

Comment lines (`# …`) then header. **Controller indices are sparse:**
members `nvme0n1`, `nvme1n1`, `nvme3n1`, `nvme4n1`; **`nvme2` = OSDISK** on the ×4 seat
(`campaign/topology-4wide.json`). Do **not** assume dense `nvme0..nvme3` ↔ members[0..3].

| Concept | CSV column(s) | Pack / normalize |
|---|---|---|
| Time | `epoch_ms` | `t` = (epoch_ms − t0)/1000; chapters from journal `rails_begin`/`rails_end` |
| SN1 temp | `ssd_temp_nvme0_composite_c` | `face3-mid` |
| SN2 temp | `ssd_temp_nvme1_composite_c` | `face3-low` |
| SN3 temp | `ssd_temp_nvme3_composite_c` | `opp-a` |
| SN4 temp | `ssd_temp_nvme4_composite_c` | `opp-b` |
| OSDISK temp | `ssd_temp_nvme2_composite_c` | `os-x4` (idle) |
| SN1..4 bw | `disk_nvme{0,1,3,4}n1_{read,write}_bytes_per_s` | ÷ 1e9 → GB/s (active members only in pool) |
| Pool bw | sum of **active** member disk columns | `pool.readGBs` / `pool.writeGBs` |

Rebuild:

```bash
python3 scripts/build-calibration-pack.py   # calibrate defaults
python3 scripts/build-calibration-pack.py \
  --result-dir results/2026-09-11-20.54-storage.dendrite-sut \
  --out site/telemetry-viz/data/cell1-single \
  --profile cell1-single
```

Host / `harness_commit` are redacted in the pack for promote-safety.

---

## Role vocabulary (board seats)

| Role | Meaning | Cell1 single | Calibrate |
|---|---|---|---|
| `os-x4` | Gen4 **×4** — face A upper | idle (OSDISK) | idle (OSDISK) |
| `face3-mid` | Gen4 ×1 — face A mid | **SN1 active** | SN1 active |
| `face3-low` | Gen4 ×1 — face A low | idle | SN2 active |
| `opp-a` | Gen4 ×1 — opposite | idle | SN3 active |
| `opp-b` | Gen4 ×1 — opposite | idle | SN4 active |

Seat↔SN assignment is **provisional** until Ronald’s photo / silkscreen map.

Legacy aliases in `normalize.js`: `slot-x4`→`os-x4`, `backside-a`→`opp-a`, `backside-b`→`opp-b`,
`inner-cpu`→`face3-mid`, `outer`→`face3-low`.

---

## Playback badges

| Source | HUD / banner |
|---|---|
| Cell1 single pack | **CELL1 · single · provisional** · stage1-single-full · **not story-sealed** |
| Calibrate pack | **CALIBRATE · provisional** · Protocol B calibrate raidz2 · **not story-sealed** · shape/DEMO only |
| Synthetic `demoTelemetry` | **DEMO · provisional** |

---

## Cell-2 fields (schema afternoon — optional)

From `docs/result-schema.md` / first stage-1 cell 2:

- `tests.<case>.thermal` — `baseline_c`, `pre_min_c`, `decision`, `before_c`/`after_c`/`max_during_c`,
  `lead_in_10s`/`lead_out_10s`, `idle_before_s`/`idle_after_s`
- SMART at 1 Hz per member (sensor temps, throttle transitions, data units) in telemetry CSV
- companions: `thermal-<case>.json`, `zpool-1hz.raw`

Wire these when a cell containing them is promoted into a pack (still not a story promote
unless Publisher says so).

---

## Rules of thumb

1. Always normalize — never bind chart/board to CSV columns directly.
2. Units: **GB/s** decimal SI (bytes/s ÷ 1e9). Ceiling is **per direction**.
3. Packs: `storySealed=false`; badges **CELL1 · single · provisional** / **CALIBRATE · provisional**.
4. Public Pages: SN / OSDISK labels or hide — never full serials or `/dev/disk/...` paths.
5. Promote **sanitized pack only** to the public repo — never raw `results/` trees.
6. Do not chart `results/deprecated-fixed60/` (protocol A).
7. Cell1 `nActive=1` / `activeRoles=['face3-mid']` — only one board seat glows.


## Platform sensors (`docs/sensor-schema.md`)

Pack ticks may include `platform` (joined when present):

| Field | Source rail | Notes |
|-------|-------------|--------|
| `cpuTempC` | `telemetry-1hz.csv` `cpu_temp_tctl_c` | Always on sealed storage cells |
| `tempCtrlC` / `tempNandC` | `ssd_temp_*_sensor_{1,2}_c` | Per-drive ctrl / NAND |
| `socketPowerW`, `socTempC`, `fclkMhz`, `dram*MBps`, `nic*TempC`, … | `hwmon-1hz.csv` | Newer cells only; UI shows em-dash until pack has the rail |
| `throttleFlags` | non-zero `throttle_residency_*` | Coarse live flag; case deltas live in result.json |

Absent on this platform (do not invent): fan RPM, board thermistor, skin temp, Tccd/Tdie — see sensor-schema absent table.
