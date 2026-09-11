# Telemetry adapter — N5 MAX M.2 viz

**Status:** sealed **calibration** pack wired (`data/calibration/`) from cell
`2026-09-11-19.41-storage.dendrite-sut` (`mode=calibrate`, `layout=stage1-raidz2-calibrate`).
Synthetic DEMO playlist remains as a fallback toggle.

**Playback role:** **shape / DEMO only** — `CALIBRATE · provisional · not story-sealed`.
This is **not** a story promote and **not** the public RAID10/RAIDZ1 chapter.

**Policy:** do **not** ingest in-flight STO slices — cell seal only.

**Schema:** field meanings follow lab `docs/result-schema.md` (recklessnode/minisforum-n5-max-benchmark)
(generated from this sealed cell + afternoon/cell-2 fields). Pack is a sanitized projection
for the viz (SN labels only).

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
    active: boolean
  }],
  pool: { readGBs: number, writeGBs: number },
  meta: {
    demo?: boolean,
    calibrate?: boolean,
    provisional?: boolean,
    storySealed?: boolean,      // always false for this pack
    testName?: string,
    layout?: string,
    headline?: string,
    playlistId?: string,
    nActive?: number,
    playbackBadge?: string,     // "CALIBRATE · provisional"
    protocol?: string,
    sourceCell?: string
  }
}
```

API: `normalizeSample(raw)` → model above (`js/normalize.js`).
Calibration loader: `N5Calibration.loadPack()` / `chapterRun()` (`js/calibrationLoader.js`).

---

## result.json (schema-aligned)

Canonical table: `docs/result-schema.md`. Viz-relevant top-level keys used by the pack:

| key | example | viz use |
|---|---|---|
| `host` | `dendrite-sut` | meta |
| `suite` / `mode` | `storage` / `calibrate` | badge + filter |
| `layout` | `stage1-raidz2-calibrate` | HUD |
| `ceiling_gbps` / `ceiling_members` | `7.88` / `4` | context (per-direction PCIe sum) |
| `members[]` | SN-labelled links, negotiated width **1** | seats; **public omits** raw `member` paths |
| `vdevs[]` | `raidz2-0` | topology chip |
| `params.protocol` | B-derived-durations | HUD / notes |
| `params.telemetry_1hz.*` | rows/coverage | pack telemetry block |
| `tests.<case>.read_gbps` / `write_gbps` | fio window logical | chapter footnotes |
| `tests.<case>.rails.pool_*_gbps` | physical rail | chapter headlines (prefer matching rw) |
| `tests.<case>.rails.steadiness` | plateau proof | optional HUD |
| `tests.<case>.thermal` | — | **cell 2+** (absent in this calibrate cell) |

Labels: drives are **SN1..SN4** (`campaign/topology-4wide.json` maps label → nvme → PCI/root port).
Deprecated protocol-A runs must not be charted.

---

## Real sampler CSV column map (cell seal)

Source: `telemetry-1hz.csv` (~3688 rows @ 1 Hz) — see schema companion-file blurb.

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
| OSDISK temp | `ssd_temp_nvme2_composite_c` | `os-x4` (idle / inactive in calibrate) |
| SN1..4 bw | `disk_nvme{0,1,3,4}n1_{read,write}_bytes_per_s` | ÷ 1e9 → GB/s |
| Pool bw | sum of four member disk columns | `pool.readGBs` / `pool.writeGBs` |

Also present (not all shipped in slim pack): per-sensor temps, CPU%, mem_*, net_*, `disk_sda_*`,
and (cell 2+) SMART sensors/throttle/data-units per member.

Rebuild: `python3 scripts/build-calibration-pack.py` (requires sealed `DONE` in cell).

---

## Role vocabulary (board seats)

| Role | Meaning | Calibrate layout |
|---|---|---|
| `os-x4` | Gen4 **×4** — face A upper | **idle** (OSDISK) |
| `face3-mid` | Gen4 ×1 — face A mid | SN1 active |
| `face3-low` | Gen4 ×1 — face A low | SN2 active |
| `opp-a` | Gen4 ×1 — opposite | SN3 active |
| `opp-b` | Gen4 ×1 — opposite | SN4 active |

Seat↔SN assignment is **provisional** until Ronald’s photo / silkscreen map (topology notes
SMBIOS designations are incomplete for two ×1 ports). Absolute IDs still open.

Legacy aliases in `normalize.js`: `slot-x4`→`os-x4`, `backside-a`→`opp-a`, `backside-b`→`opp-b`,
`inner-cpu`→`face3-mid`, `outer`→`face3-low`.

---

## Playback badges

| Source | HUD / banner |
|---|---|
| Sealed calibrate pack | **CALIBRATE · provisional** · Protocol B calibrate raidz2 · **not story-sealed** · shape/DEMO only |
| Synthetic `demoTelemetry` | **DEMO · provisional** |

---

## Cell-2 fields (schema afternoon — not in this pack)

From `docs/result-schema.md` / first stage-1 cell 2:

- `tests.<case>.thermal` — `baseline_c`, `pre_min_c`, `decision`, `before_c`/`after_c`/`max_during_c`,
  `lead_in_10s`/`lead_out_10s`, `idle_before_s`/`idle_after_s`
- SMART at 1 Hz per member (sensor temps, throttle transitions, data units) in telemetry CSV
- companions: `thermal-<case>.json`, `zpool-1hz.raw`

Wire these when a sealed cell containing them is promoted into a pack (still not a story promote
unless Publisher says so).

---

## Rules of thumb

1. Always normalize — never bind chart/board to CSV columns directly.
2. Units: **GB/s** decimal SI (bytes/s ÷ 1e9). Ceiling is **per direction**.
3. Calibrate pack: `meta.calibrate=true`, `storySealed=false`, badge **CALIBRATE · provisional**.
4. Public Pages: SN / OSDISK labels or hide — never full serials or `/dev/disk/...` paths.
5. Promote **sanitized pack only** to the public repo — never raw `results/` trees.
6. Do not chart `results/deprecated-fixed60/` (protocol A).
