# SuperGrok second-pass prompt — N5 MAX sealed storage (+ provisional AI)

You are doing a **second analytical pass** over the Minisforum N5 MAX hot-tier NVMe campaign after N5 Lab’s interactive site pass (`site/interactive-compare-v2`). Your job is to dig for easy-to-miss joins, stress-test recommendations, and propose **labeled hypotheses** — never invent sealed numbers.

Banner context: `story_sealed=false`. RUNNING ANALYSIS. AI stage is provisional.

---

## Methodology we used (N5 Lab first pass)

1. **Protocol B only** — `params.protocol` starts with `B-`; derived ramps; working set past SLC.
2. **Steadiness rails** — publishable fio requires `rails.steadiness.steady==true`; non-steady labeled/hatched. STO-06 wall-clock → steadiness N/A, labeled.
3. **Cold is the layout story** — ZFS `primarycache=none`; FS `cache_state=cold`. Metadata ARC and warm page-cache are shown with warnings; warm FS seqRD ~36 GB/s is DRAM, not the array.
4. **Dual winner stance (Claude / Ronald)** — fastest measured = **btrfs-raid5**; recommended default = **raidz1** (Proxmox/ZFS ecosystem). Do not collapse into one scalar.
5. **HOLD mdadm 8×** — parity seqRD pin ~1.14 GB/s is an open anomaly (lab #55), not a filesystem headline.
6. **Public scrub** — interactive UI and published figures come from scrubbed `data/sealed-metrics.json` (no private lab result paths / SUT hostnames; SN labels only).
7. **Write-hole honesty** — lab flags `FSB-BTRFS-12` / `write_hole_exposed: true` for btrfs raid5/6 **data**; metadata off parity via `-m raid1c3` (`FSB-BTRFS-04`). **We did not crash-inject / unclean-shutdown.** Upstream Status still rates RAID56 **unstable**; RST RAID5 is experimental/RFC — do **not** claim “Fedora/Ubuntu fixed the write-hole.”
8. **OS recipes** — Proxmox → raidz1 default; Fedora/Ubuntu → btrfs-raid5 may win on **measured speed** with write-hole caveat; TrueNAS/FreeNAS → ZFS-native only (raidz1 default). Cold 5×3.5″ SATA = **unmeasured**.

---

## Exact files / paths to analyze

### Public face (scrubbed)
- `/workspace/n5-max-public/data/sealed-metrics.json` — sole interactive number source
- `/workspace/n5-max-public/index.html` — Overview / Compare / Recipes / Method / Analysis
- `/workspace/n5-max-public/js/interactive-compare.js` + `js/sealed-charts.js`
- `/workspace/n5-max-public/css/sealed.css` — includes `.reveal` visibility fix (sealed page does not load `app.js`)
- `/workspace/n5-max-public/media/charts/*.svg`
- This prompt: `docs/supergrok-second-pass-prompt.md`

### Lab analysis memo (may contain private path strings — do not copy those into public)
- `/workspace/n5-analysis/comprehensive-review.md`
- `/workspace/n5-analysis/site-data.json` / `metrics.jsonl` / `inventory.json`
- `/workspace/n5-analysis/calib-adversarial-invalidation.md`

### Lab source docs (winner / follow-up / BKMs)
- `docs/winner-selection.md` (in `recklessnode/minisforum-n5-max-benchmark`)
- `docs/followup-raid-pass.md`
- `docs/filesystem-tuning-bkms.md` (+ `.json`) — especially **FSB-BTRFS-04, FSB-BTRFS-12, FSB-MD-08**
- Matrix-linked sealed cells: lab matrix-linked sealed `result.json` cells (private checkout; cite stage/layout · test id · value only) — when citing publicly, use **stage/layout · test id · value** only

### Open lab issues to respect
- **#55** mdadm RAID5/6 cold read-path pin (~1.14 GB/s) — HOLD 8× claim
- **#56** STO-09 degraded-mode cost + rebuild toll
- **#57** raidz1 (4×x1) + SLOG on Gen4×4 — sync A/B
- **#58** Stage 6 USB/NVMe seal hygiene (result only on SUT `/tmp` historically)
- **Pending / parent may file:** write-hole / unclean-shutdown crash-inject arm; cold 5×3.5″ SATA Protocol B arm

---

## What to dig for (easy to miss)

1. **Write-hole vs measured speed** — Stress-test any “Fedora/Ubuntu → pick btrfs-raid5” recipe. Metadata `raid1c3` ≠ data write-hole closed. Propose what a crash-inject arm would need to show (without inventing outcomes). Compare to mdadm `FSB-MD-08` (same exposure class as tuned) and ZFS raidz (not in that class).
2. **Rebuild / degraded toll** — RAID5/raidz1 rebuild exposure on Gen4 ×1 4 TB members is largely unquantified in sealed story (#56). Speed winners may lose on degraded/rebuild axes.
3. **Capacity-matched seqWR gap** — btrfs-raid5 vs raidz1 seqWR (~4.07 vs ~0.72) may matter more for RAG staging than the seqRD delta; check whether any recipe under-weights it.
4. **STO-06 vs fio disagreement** — smallfiles copy converges across ZFS layouts; photo/inbox NAS rankings from fio alone mislead.
5. **Lane tax asymmetry** — ×4 helps seqRD ~3.3×, sync ~1.1×; SLOG-on-×4 (#57) is sync-shaped only.
6. **Warm/metadata contamination** — any narrative that cites ~36 GB/s or metadata ARC as layout proof is wrong.
7. **mdadm pin pattern** — raid5 and raid6 both ~1.14 seqRD / ~1.10 rnd64kR while raid10 reads normally; treat as config/path anomaly (#55).
8. **AI provisional fragility** — only four passed cells on btrfs-raid5; do not let tok/s select the storage winner.
9. **Cold SATA gap** — 5×3.5″ bay unbenchmarked. Propose measurement hypotheses (seq archive, rebuild wall-clock, power) — **do not invent GB/s**.
10. **Dual-pool / co-tenant** — AI+VM recipes that pick one layout for both workloads; look for hidden conflicts (sync vs seqRD).

---

## Focus workloads

### A. AI-first box (RAG-like)
- Hot NVMe pool streaming weights + embedding/vector IO
- Prefer seqRD + capacity; note provisional AI bat on btrfs-raid5
- Ask: does seqWR deserve equal billing for index rebuild / weight ingest?

### B. AI + VM server + cold 5×3.5″ SATA
- Hot NVMe: VMs/DB care about rnd4kW + sync; AI weights still want capacity∩seqRD
- Cold SATA: **explicitly unmeasured** — propose Protocol B hypotheses (what to seal, what would falsify “cold archive is fine”), never fabricate HDD numbers

---

## Rules (hard)

- **Never invent numbers.** Only cite sealed publishable steady figures, or label clearly as hypothesis pending seal.
- **Never claim** distro X fixed btrfs RAID56 write-hole unless you find an authoritative upstream Status change — as of lab review, Status still lists RAID56 **unstable**.
- **Never promote** calibrate / deprecated-fixed60 / preliminary-omega / non-steady unlabeled / warm-as-layout.
- **Never leak** private lab result paths, SUT hostnames, serials, by-id paths, or SUT IPs into public prose.
- HOLD mdadm 8× claim.
- Keep `story_sealed=false` mindset.

---

## Deliverables for your pass

1. Adversarial notes on N5 Lab interactive recipes (esp. OS/ecosystem + write-hole).
2. Ranked list of “easy to miss” joins with evidence pointers (stage/layout · test id).
3. Proposed measurement arms (write-hole crash-inject; cold SATA; degraded/rebuild) as issue-ready briefs.
4. Optional: suggested slider presets or callouts if the interactive UI under-emphasizes an axis — without changing sealed JSON numbers.
