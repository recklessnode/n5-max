# Telemetry adapter — N5 MAX M.2 viz

**Status:** **calibrate** pack wired (`data/calibration/`) —
`mode=calibrate`, `layout=stage1-raidz2-calibrate`.
**Provisional · shape/DEMO only** — not story-sealed. Synthetic DEMO playlist remains as a fallback toggle.

**Playback role:** **shape / DEMO only** — `CALIBRATE · provisional · not story-sealed`.
This is **not** a story promote and **not** the public RAID10/RAIDZ1 chapter.

**Policy:** do **not** ingest in-flight STO slices — cell seal only.

**Schema:** pack fields are a sanitized projection for the viz (SN labels only).

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

## Pack meta (sanitized)

Viz-relevant top-level keys in `data/calibration/meta.json`:

| key | example | viz use |
|---|---|---|
| `host` | `sut` (redacted) | meta |
| `suite` / `mode` | `storage` / `calibrate` | badge + filter |
| `layout` | `stage1-raidz2-calibrate` | HUD |
| `ceiling_gbps` / `ceiling_members` | `7.88` / `4` | context (per-direction PCIe sum) |
| `members[]` | SN-labelled links, negotiated width **1** | seats; **public omits** raw `member` paths |
| `vdevs[]` | `raidz2-0` | topology chip |
| `params.protocol` / `protocol` | B-derived-durations | HUD / notes |
| `telemetry` | rows / hz / columns | pack telemetry block |
| `chapters[].*` fio / pool rails | chapter headlines (prefer matching rw) |
| `tests.<case>.thermal` | — | **cell 2+** (absent in this calibrate pack) |

Labels: drives are **SN1..SN4**. Deprecated protocol-A runs must not be charted.

---

## Sampler column map (pack)

Source: 1 Hz telemetry projected into `telemetry.min.json`.

**Controller indices are sparse:** members `nvme0n1`, `nvme1n1`, `nvme3n1`, `nvme4n1`; **`nvme2` = OSDISK** on the ×4 seat. Do **not** assume dense `nvme0..nvme3` ↔ members[0..3].

| Concept | Pack / normalize |
|---|---|
| Time | `t` seconds from chapter start; chapters from rails begin/end windows |
| SN1 temp | `face3-mid` |
| SN2 temp | `face3-low` |
| SN3 temp | `opp-a` |
| SN4 temp | `opp-b` |
| OSDISK temp | `os-x4` (idle / inactive in calibrate) |
| SN1..4 bw | GB/s decimal SI |
| Pool bw | `pool.readGBs` / `pool.writeGBs` |

---

## Role vocabulary (board seats)

| Role | Meaning | Calibrate layout |
|---|---|---|
| `os-x4` | Gen4 **×4** — face A upper | **idle** (OSDISK) |
| `face3-mid` | Gen4 ×1 — face A mid | SN1 active |
| `face3-low` | Gen4 ×1 — face A low | SN2 active |
| `opp-a` | Gen4 ×1 — opposite | SN3 active |
| `opp-b` | Gen4 ×1 — opposite | SN4 active |

Seat↔SN assignment is **provisional** pending photo / silkscreen confirmation (SMBIOS designations are incomplete for two ×1 ports). Absolute IDs still open.

Legacy aliases in `normalize.js`: `slot-x4`→`os-x4`, `backside-a`→`opp-a`, `backside-b`→`opp-b`,
`inner-cpu`→`face3-mid`, `outer`→`face3-low`.

---

## Playback badges

| Source | HUD / banner |
|---|---|
| Calibrate pack | **CALIBRATE · provisional** · Protocol B calibrate raidz2 · **not story-sealed** · shape/DEMO only |
| Synthetic `demoTelemetry` | **DEMO · provisional** |

---

## Cell-2 fields (not in this pack)

- `tests.<case>.thermal` — baseline / pre / decision / before/after/max / lead-in/out / idle windows
- SMART at 1 Hz per member (sensor temps, throttle transitions, data units)
- companions: thermal per-case JSON, zpool 1 Hz raw

Wire these when a calibrate cell containing them is promoted into a pack (still not a story promote
unless Publisher says so).

---

## Rules of thumb

1. Always normalize — never bind chart/board to CSV columns directly.
2. Units: **GB/s** decimal SI (bytes/s ÷ 1e9). Ceiling is **per direction**.
3. Calibrate pack: `meta.calibrate=true`, `storySealed=false`, badge **CALIBRATE · provisional**.
4. Public Pages: SN / OSDISK labels or hide — never full serials or `/dev/disk/...` paths.
5. Promote **sanitized pack only** — never raw results trees.
6. Do not chart deprecated protocol-A runs.
