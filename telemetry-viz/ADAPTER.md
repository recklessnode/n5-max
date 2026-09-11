# Telemetry adapter — N5 MAX M.2 viz

Lab-report note: the real **1 Hz** sampler format was just rewritten; **no completed runs** exist yet for this schema. This prototype consumes **synthetic** ticks from `demoTelemetry.synthesizeRun()` and passes every tick through `normalizeSample(raw)`.

When a golden-image / sampler CSV lands, map columns here — **do not** assume the synth field names are final.

---

## Target model (post-normalize)

```ts
{
  t: number,                    // seconds from run start (1 Hz ticks)
  drives: [{
    role: string,               // os-x4 | face3-mid | face3-low | opp-a | opp-b
    serialSuffix: string,       // last-4 for default UI
    serialFull?: string,        // optional; public Pages MUST NOT render
    tempC: number,
    readGBs: number,
    writeGBs: number,
    active: boolean
  }],
  pool: { readGBs: number, writeGBs: number },
  meta: {
    demo?: boolean,
    testName?: string,
    layout?: string,
    headline?: string,
    playlistId?: string,
    nActive?: number,
    provisionalContext?: object      // reference only — not claimed as this run
  }
}
```

API: `normalizeSample(raw)` → model above (`js/normalize.js`).

---

## Golden-image §6 channels → normalize

Map these **conceptual** channels (names may differ in the forthcoming CSV):

| §6 / sampler concept | Preferred raw keys (accepted aliases) | Normalized field |
|---|---|---|
| Elapsed time (s) | `t`, `time`, `timestamp`, `elapsed_s` | `t` |
| Seat / role id | `role`, `slot`, `seat`, `id` | `drives[].role` |
| Serial number | `serial`, `serialFull`, `sn` | `serialFull` + derived `serialSuffix` |
| NAND / SMART temp °C | `tempC`, `temp_c`, `temperature`, `temp` | `tempC` |
| Host read throughput | `readGBs`, `read_GBs`, `read_gb_s`, or `read_MBs` (/1000) | `readGBs` |
| Host write throughput | `writeGBs`, `write_GBs`, `write_gb_s`, or `write_MBs` (/1000) | `writeGBs` |
| Drive participating | `active`, or inferred from throughput / `present` | `active` |
| Pool / zpool read | `pool.readGBs`, `pool.read_GBs`, `pool.read_gb_s` | `pool.readGBs` (else sum of active drives) |
| Pool / zpool write | `pool.writeGBs`, … | `pool.writeGBs` |
| Test label | `testName`, `meta.testName` | `meta.testName` |
| Topology string | `layout`, `meta.layout` | `meta.layout` |

**Role vocabulary (board seats — layout brief applied):**

| Role | Meaning | Heat bias (demo hyp) |
|---|---|---|
| `os-x4` | Gen4 **×4** — sole ×4; three-slot face upper (OS / spine SLOT) | cooler |
| `face3-mid` | Gen4 ×1 — three-slot face middle (nearer SoC) | warmer hyp |
| `face3-low` | Gen4 ×1 — three-slot face lower (outer edge) | cooler hyp |
| `opp-a` | Gen4 ×1 — opposite face (paired stack near heatsink) | least-airflow / backside hyp |
| `opp-b` | Gen4 ×1 — opposite face (paired stack) | least-airflow / backside hyp |

Legacy aliases remapped in `normalize.js`: `slot-x4`→`os-x4`, `backside-a`→`opp-a`, `backside-b`→`opp-b`, `inner-cpu`→`face3-mid`, `outer`→`face3-low`.

If the sampler emits PCI addresses or `nvmeXnY` names, add a **serial→slot** table here before wiring live data. **Absolute seat IDs still need Ronald’s photo map.**

---

## Sampler CSV (expected to change)

Hypothetical header (illustrative only — **will change**):

```text
elapsed_s,role,serial,temp_c,read_MBs,write_MBs,pool_read_MBs,pool_write_MBs,active,test_name,layout
```

Ingest sketch:

```js
function rowToRaw(row) {
  return {
    t: row.elapsed_s,
    drives: [/* group by t across roles */],
    pool: {
      read_GBs: row.pool_read_MBs / 1000,
      write_GBs: row.pool_write_MBs / 1000,
    },
    meta: { demo: false, testName: row.test_name, layout: row.layout },
  };
}
// then: normalizeSample(raw)
```

Rules of thumb:

1. Always normalize — never bind the chart/board to CSV columns directly.
2. Units: prefer **GB/s** (decimal SI as used in lab notes). Convert MB/s ÷ 1000 in the adapter edge.
3. `meta.demo = false` only for completed / reviewed sampler runs.
4. Public GitHub Pages: force serial mode **last4** or **hide**; never ship `full`.

---

## Provisional context (reference ceilings — DEMO only)

| Metric | Value |
|---|---|
| RAIDZ1 sequential read | 6.02 GB/s |
| Amplification | 1.375× |
| Gen4×1 ceiling | 1.97 GB/s |
| NM790 @ ×1 | ≈ 1.81 GB/s |

Synth playlist shapes toward these numbers and labels every value **DEMO · provisional**.
