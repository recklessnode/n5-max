#!/usr/bin/env python3
"""
Build sanitized telemetry-viz pack from a sealed cell.

Default (calibrate):
  Source: results/2026-09-11-19.41-storage.dendrite-sut/
  Output: site/telemetry-viz/data/calibration/{meta.json,telemetry.min.json}

Cell1 single (example):
  python3 scripts/build-calibration-pack.py \\
    --result-dir results/2026-09-11-20.54-storage.dendrite-sut \\
    --out site/telemetry-viz/data/cell1-single \\
    --profile cell1-single

Aligned with docs/result-schema.md. Public pack uses SN labels only
(no full disk paths / host / harness). NOT a story promote.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CELL = ROOT / "results" / "2026-09-11-19.41-storage.dendrite-sut"
DEFAULT_OUT = ROOT / "site" / "telemetry-viz" / "data" / "calibration"

# Array seats (4× Gen4×1); os-x4 idle unless member maps there.
# Absolute seat map still needs Ronald photo map — provisional assignment by member order.
# Default 4-wide seat map (overridden per-cell from result.json members when present).
MEMBER_SEATS = [
    # sn_label, role, nvme_ctrl (for temp col), block_dev (for disk_* cols)
    ("SN1", "face3-mid", "nvme0", "nvme0n1"),
    ("SN2", "face3-low", "nvme1", "nvme1n1"),
    ("SN3", "opp-a", "nvme3", "nvme3n1"),
    ("SN4", "opp-b", "nvme4", "nvme4n1"),
]
OS_SEAT = ("OSDISK", "os-x4", "nvme2", "nvme2n1")  # topology OSDISK on ×4; SN5 takes this seat when present

# Board role by SN label (stable across NVMe controller renumbering).
LABEL_TO_ROLE = {
    "SN1": "face3-mid",
    "SN2": "face3-low",
    "SN3": "opp-a",
    "SN4": "opp-b",
    "SN5": "os-x4",  # 5th NM790 in Gen4×4 SLOT
    "OSDISK": "os-x4",
}

CALIBRATE_CHAPTER_TAGS = [
    "STO-01_seq_write_1M_j1",
    "STO-01_seq_read_1M_j1",
    "STO-01_seq_write_1M_j4",
    "STO-01_seq_read_1M_j4",
    "STO-02_rand_read_4k_j4",
    "STO-02_rand_write_4k_j4",
]


def parse_iso_z(ts: str) -> int:
    """Return epoch_ms from journal ISO Z timestamp."""
    dt = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def sn_label_from_member(member: str) -> str:
    m = re.search(r"_(SN\d+)\b", member) or re.search(r"(SN\d+)", member)
    return m.group(1) if m else "SN?"



def _public_member_label(m) -> str:
    if not isinstance(m, str):
        return m
    lab = sn_label_from_member(m)
    if lab != "SN?":
        return lab
    if "_SN" in m:
        return m.rsplit("_", 1)[-1].split("-part")[0]
    if "by-id" in m or "/dev/" in m:
        return "SN?"
    return m.split("-part")[0] if "-part" in m else m

def seat_for_label(label: str):
    return next((s for s in MEMBER_SEATS if s[0] == label), None)


def _ctrl_bdev_from_dev(dev: str | None) -> tuple[str, str]:
    """nvme0n1 / nvme0 → (nvme0, nvme0n1)."""
    d = (dev or "").strip()
    if d.endswith("n1") and d.startswith("nvme"):
        return d[:-2], d
    if d.startswith("nvme"):
        return d, d + "n1"
    return d, d


def seats_from_result(result: dict) -> tuple[list[tuple[str, str, str, str]], bool]:
    """
    Per-cell seats from result.json members (label, role, ctrl, bdev).
    Returns (seats, include_idle_os). When SN5 occupies ×4, skip idle OSDISK.
    Falls back to MEMBER_SEATS if members lack usable labels.
    """
    seats: list[tuple[str, str, str, str]] = []
    has_os_role = False
    for m in result.get("members") or []:
        label = sn_label_from_member(m.get("member") or "")
        if not label or label == "SN?":
            continue
        role = LABEL_TO_ROLE.get(label)
        if not role:
            continue
        ctrl, bdev = _ctrl_bdev_from_dev(m.get("dev"))
        seats.append((label, role, ctrl, bdev))
        if role == "os-x4":
            has_os_role = True
    if not seats:
        return list(MEMBER_SEATS), True
    return seats, not has_os_role


def detect_profile(result: dict) -> str:
    layout = (result.get("layout") or "").lower()
    mode = (result.get("mode") or "").lower()
    if "single" in layout or mode == "full" and "single" in layout:
        return "cell1-single"
    if mode == "calibrate" or "calibrate" in layout:
        return "calibrate"
    # fallback: member count
    n = len(result.get("members") or [])
    if n <= 1:
        return "cell1-single"
    return "calibrate"


def profile_meta(profile: str, result: dict, source_cell: str) -> dict:
    """Badge / protocol / playback notes for the pack kind."""
    if profile == "cell1-single":
        return {
            "schema": "telemetry-viz-cell-pack/v1",
            "playback_role": "cell1-shape-demo",
            "protocol_label": "Protocol B stage1-single-full",
            "playback_badge": "CELL1 · single · provisional",
            "note": (
                "Cell 1 single-drive pack (provisional · shape/DEMO) — "
                "NOT story-sealed (steadiness incomplete). Not a story promote."
            ),
            "mode_key": "cell1-single",
        }
    if profile == "stage1":
        layout = result.get("layout") or "stage1"
        pc = (result.get("params") or {}).get("primarycache") or "none"
        short = (
            str(layout)
            .replace("stage1-", "")
            .replace("-full", "")
            .replace("-calibrate", "")
        )
        return {
            "schema": "telemetry-viz-stage1-pack/v1",
            "playback_role": "stage1-simulator",
            "protocol_label": f"Protocol B stage1 · {short} · pc={pc}",
            "playback_badge": f"SIM · {short} · {pc} · provisional",
            "note": (
                "Stage 1 Simulator pack (provisional · shape/DEMO) — "
                "NOT story-sealed. Layout × primarycache cell for lab comparison."
            ),
            "mode_key": "stage1",
        }
    return {
        "schema": "telemetry-viz-calibration-pack/v1",
        "playback_role": "shape-demo",
        "protocol_label": "Protocol B calibrate raidz2",
        "playback_badge": "CALIBRATE · provisional",
        "note": (
            "Calibrate pack playback (provisional · shape/DEMO) — "
            "NOT the public RAID10/RAIDZ1 story chapter."
        ),
        "mode_key": "calibrate",
    }


def load_result(cell: Path):
    return json.loads((cell / "result.json").read_text())


def load_journal_windows(cell: Path):
    """Map tag -> {begin_ms, end_ms} from rails_begin / rails_end (fio) atoms."""
    windows = {}
    with (cell / "journal.jsonl").open() as f:
        for line in f:
            o = json.loads(line)
            atom = o.get("atom")
            detail = o.get("detail") or {}
            tag = detail.get("tag")
            if not tag:
                continue
            ts_ms = parse_iso_z(o["ts"])
            if atom == "rails_begin":
                windows.setdefault(tag, {})["begin_ms"] = ts_ms
            elif atom in ("rails_end", "fio"):
                # prefer rails_end; fio is same wall roughly
                if atom == "rails_end" or "end_ms" not in windows.get(tag, {}):
                    windows.setdefault(tag, {})["end_ms"] = ts_ms
    return windows


def active_labels_from_result(result: dict) -> list[str]:
    labels = []
    for m in result.get("members") or []:
        label = sn_label_from_member(m.get("member") or "")
        if label and label not in labels:
            labels.append(label)
    return labels


def active_roles_from_labels(labels: list[str]) -> list[str]:
    roles = []
    for label in labels:
        role = LABEL_TO_ROLE.get(label)
        if role and role not in roles:
            roles.append(role)
    return roles


def _f(row: dict, key: str, scale: float = 1.0):
    v = row.get(key)
    if v in ("", None):
        return None
    try:
        return float(v) * scale
    except (TypeError, ValueError):
        return None


def slim_platform_from_tele(row: dict) -> dict:
    """Platform fields available on historical telemetry-1hz.csv (sensor-schema)."""
    plat = {}
    tctl = _f(row, "cpu_temp_tctl_c")
    if tctl is not None:
        plat["cpuTempC"] = round(tctl, 2)
    # mem available as GiB hint (optional)
    avail = _f(row, "mem_available_kb", 1 / (1024 * 1024))
    if avail is not None:
        plat["memAvailableGiB"] = round(avail, 2)
    return plat


def slim_platform_from_hwmon(row: dict) -> dict:
    """Join docs/sensor-schema hwmon-1hz.csv — present only on newer cells."""
    if not row:
        return {}
    plat = {}
    mapping = [
        ("soc_temp_c", "socTempC", 1.0),
        ("gfx_temp_c", "gfxTempC", 1.0),
        ("amdgpu_edge_temp_c", "gpuEdgeTempC", 1.0),
        ("socket_power_w", "socketPowerW", 1.0),
        ("apu_power_w", "apuPowerW", 1.0),
        ("all_core_power_w", "allCorePowerW", 1.0),
        ("gfx_power_w", "gfxPowerW", 1.0),
        ("rapl_package_0_w", "raplPackageW", 1.0),
        ("rapl_core_w", "raplCoreW", 1.0),
        ("fclk_mhz", "fclkMhz", 1.0),
        ("uclk_mhz", "uclkMhz", 1.0),
        ("socclk_mhz", "socclkMhz", 1.0),
        ("gfxclk_mhz", "gfxclkMhz", 1.0),
        ("core_c0_pct_mean", "coreC0PctMean", 1.0),
        ("core_c0_pct_max", "coreC0PctMax", 1.0),
        ("gfx_activity_pct", "gfxActivityPct", 1.0),
        ("dram_read_mbps", "dramReadMBps", 1.0),
        ("dram_write_mbps", "dramWriteMBps", 1.0),
        ("nic0_temp_c", "nic0TempC", 1.0),
        ("nic1_temp_c", "nic1TempC", 1.0),
    ]
    for src, dst, scale in mapping:
        v = _f(row, src, scale)
        if v is not None:
            plat[dst] = round(v, 3)
    # throttle: any non-zero residency is a flag (raw counts are for case deltas)
    throttle_keys = [
        "throttle_residency_prochot",
        "throttle_residency_spl",
        "throttle_residency_fppt",
        "throttle_residency_sppt",
        "throttle_residency_thm_core",
        "throttle_residency_thm_gfx",
        "throttle_residency_thm_soc",
    ]
    flags = []
    for k in throttle_keys:
        v = _f(row, k)
        if v is not None and v > 0:
            flags.append(k.replace("throttle_residency_", ""))
    if flags:
        plat["throttleFlags"] = flags
    return plat


def slim_row(
    row: dict,
    t0_ms: int,
    active_labels: set[str],
    seats: list[tuple[str, str, str, str]],
    include_idle_os: bool = True,
    hwmon: dict | None = None,
) -> dict:
    """Normalize one CSV row to viz-friendly tick (no serials / by-id)."""
    epoch_ms = int(float(row["epoch_ms"]))
    t = round((epoch_ms - t0_ms) / 1000.0, 3)

    drives = []
    # Idle OS seat only when ×4 is not an active pool member (SN5).
    if include_idle_os:
        os_temp = row.get(f"ssd_temp_{OS_SEAT[2]}_composite_c") or ""
        drives.append(
            {
                "role": OS_SEAT[1],
                "label": OS_SEAT[0],
                "serialSuffix": OS_SEAT[0],
                "tempC": float(os_temp) if os_temp not in ("", None) else None,
                "tempCtrlC": None,
                "tempNandC": None,
                "readGBs": 0.0,
                "writeGBs": 0.0,
                "active": False,
            }
        )

    pool_r = 0.0
    pool_w = 0.0
    for label, role, ctrl, bdev in seats:
        temp_s = row.get(f"ssd_temp_{ctrl}_composite_c") or ""
        ctrl_s = row.get(f"ssd_temp_{ctrl}_sensor_1_c") or ""
        nand_s = row.get(f"ssd_temp_{ctrl}_sensor_2_c") or ""
        rd_s = row.get(f"disk_{bdev}_read_bytes_per_s") or ""
        wr_s = row.get(f"disk_{bdev}_write_bytes_per_s") or ""
        rd = float(rd_s) / 1e9 if rd_s not in ("", None) else 0.0
        wr = float(wr_s) / 1e9 if wr_s not in ("", None) else 0.0
        is_active = label in active_labels
        if is_active:
            pool_r += rd
            pool_w += wr
        drives.append(
            {
                "role": role,
                "label": label,
                "serialSuffix": label,  # SN1.. — not full serial
                "tempC": float(temp_s) if temp_s not in ("", None) else None,
                "tempCtrlC": float(ctrl_s) if ctrl_s not in ("", None) else None,
                "tempNandC": float(nand_s) if nand_s not in ("", None) else None,
                "readGBs": round(rd, 4) if is_active else 0.0,
                "writeGBs": round(wr, 4) if is_active else 0.0,
                "active": is_active,
            }
        )

    platform = slim_platform_from_tele(row)
    platform.update(slim_platform_from_hwmon(hwmon or {}))

    out = {
        "t": t,
        "epoch_ms": epoch_ms,
        "drives": drives,
        "pool": {"readGBs": round(pool_r, 4), "writeGBs": round(pool_w, 4)},
    }
    if platform:
        out["platform"] = platform
    return out


def chapter_tags_for_profile(profile: str, result: dict, windows: dict) -> list[str]:
    if profile == "calibrate":
        return list(CALIBRATE_CHAPTER_TAGS)
    # cell1-single / stage1: preserve result.json test order; only tags with windows
    tests = result.get("tests") or {}
    tags = []
    for tag in tests.keys():
        win = windows.get(tag) or {}
        if win.get("begin_ms") is not None and win.get("end_ms") is not None:
            tags.append(tag)
    # also pick up window-only tags not in tests (unlikely)
    for tag, win in windows.items():
        if tag not in tags and win.get("begin_ms") is not None and win.get("end_ms") is not None:
            tags.append(tag)
    return tags


def build_chapters(result, windows, t0_ms, last_ms, profile: str, active_roles: list[str]):
    chapters = []
    tests = result.get("tests") or {}
    tags = chapter_tags_for_profile(profile, result, windows)
    for tag in tags:
        tinfo = tests.get(tag) or {}
        win = windows.get(tag) or {}
        begin = win.get("begin_ms")
        end = win.get("end_ms")
        if begin is None or end is None:
            continue
        begin = max(begin, t0_ms)
        end = min(end, last_ms)
        rails = tinfo.get("rails") or {}
        pool_r = rails.get("pool_read_gbps")
        pool_w = rails.get("pool_write_gbps")
        fio_r = tinfo.get("read_gbps")
        fio_w = tinfo.get("write_gbps")
        # Prefer direction matching case rw; pool rail for amplify-aware display
        rw = (tinfo.get("rw") or "").lower()
        is_write = "write" in rw and "rw" not in rw  # write/randwrite
        is_read = "read" in rw and "rw" not in rw
        if is_write:
            if pool_w is not None and pool_w > 0.01:
                headline = f"~{pool_w:.2f} GB/s pool write"
                headline_target = pool_w
            else:
                headline = f"~{(fio_w or 0):.2f} GB/s fio write"
                headline_target = fio_w or 0
        elif is_read:
            if pool_r is not None and pool_r > 0.01:
                headline = f"~{pool_r:.2f} GB/s pool read"
                headline_target = pool_r
            else:
                headline = f"~{(fio_r or 0):.2f} GB/s fio read"
                headline_target = fio_r or 0
        else:
            # mixed / smallfiles / unknown — prefer pool throughput
            pr = pool_r or 0
            pw = pool_w or 0
            if pr >= pw and pr > 0.01:
                headline = f"~{pr:.2f} GB/s pool read"
                headline_target = pr
            elif pw > 0.01:
                headline = f"~{pw:.2f} GB/s pool write"
                headline_target = pw
            else:
                headline = f"~{pr:.2f}R/{pw:.2f}W GB/s pool"
                headline_target = pr + pw

        steadiness = rails.get("steadiness") or {}
        optional = not tag.startswith("STO-01")
        chapters.append(
            {
                "id": tag,
                "name": tag.replace("_", " "),
                "tag": tag,
                "layout": result.get("layout"),
                "headline": headline,
                "headlineTarget": headline_target,
                "begin_ms": begin,
                "end_ms": end,
                "t0": round((begin - t0_ms) / 1000.0, 3),
                "t1": round((end - t0_ms) / 1000.0, 3),
                "wall_s": tinfo.get("wall_s"),
                "rw": tinfo.get("rw"),
                "bs": tinfo.get("bs"),
                "numjobs": tinfo.get("numjobs"),
                "read_gbps": fio_r,
                "write_gbps": fio_w,
                "pool_read_gbps": pool_r,
                "pool_write_gbps": pool_w,
                "steady": steadiness.get("steady"),
                "activeRoles": list(active_roles),
                "mode": profile,
                "optional": optional,
            }
        )
    return chapters


def read_csv_rows(path: Path):
    if not path.exists():
        return []
    rows_raw = []
    with path.open(newline="") as f:
        header = None
        lines = []
        for line in f:
            if line.startswith("#"):
                continue
            if header is None:
                header = line.strip()
                continue
            lines.append(line)
        if header is None:
            return []
        reader = csv.DictReader([header] + lines)
        for row in reader:
            rows_raw.append(row)
    return rows_raw


def read_telemetry_rows(cell: Path):
    return read_csv_rows(cell / "telemetry-1hz.csv")


def read_hwmon_by_epoch(cell: Path) -> dict[int, dict]:
    """Optional hwmon-1hz.csv rail (docs/sensor-schema). Historical cells omit it."""
    rows = read_csv_rows(cell / "hwmon-1hz.csv")
    out = {}
    for row in rows:
        try:
            epoch = int(float(row["epoch_ms"]))
        except (KeyError, TypeError, ValueError):
            continue
        out[epoch] = row
    return out


def nearest_hwmon(hwmon_by_epoch: dict[int, dict], epoch_ms: int, max_skew_ms: int = 1500):
    if not hwmon_by_epoch:
        return None
    if epoch_ms in hwmon_by_epoch:
        return hwmon_by_epoch[epoch_ms]
    # nearest within skew (1 Hz rails can be off by a beat)
    best = None
    best_d = None
    for k, row in hwmon_by_epoch.items():
        d = abs(k - epoch_ms)
        if d <= max_skew_ms and (best_d is None or d < best_d):
            best, best_d = row, d
    return best


def build_pack(cell: Path, out: Path, profile: str | None = None):
    if not (cell / "DONE").exists():
        raise SystemExit(f"cell not sealed (missing DONE): {cell}")

    result = load_result(cell)
    if profile in (None, "auto"):
        profile = detect_profile(result)

    windows = load_journal_windows(cell)
    rows_raw = read_telemetry_rows(cell)
    if not rows_raw:
        raise SystemExit("no telemetry rows")

    t0_ms = int(float(rows_raw[0]["epoch_ms"]))
    last_ms = int(float(rows_raw[-1]["epoch_ms"]))

    active_labels_list = active_labels_from_result(result)
    if not active_labels_list:
        raise SystemExit("no active members in result.json")
    active_labels = set(active_labels_list)
    seats, include_idle_os = seats_from_result(result)
    active_roles = active_roles_from_labels(active_labels_list)
    if not active_roles:
        raise SystemExit(f"could not map active labels {active_labels_list} to seats")

    hwmon_by_epoch = read_hwmon_by_epoch(cell)
    ticks = []
    for r in rows_raw:
        epoch_ms = int(float(r["epoch_ms"]))
        ticks.append(
            slim_row(
                r,
                t0_ms,
                active_labels,
                seats,
                include_idle_os,
                nearest_hwmon(hwmon_by_epoch, epoch_ms),
            )
        )
    has_hwmon = any(bool(tick.get("platform") and (
        "socketPowerW" in tick["platform"] or "socTempC" in tick["platform"]
    )) for tick in ticks[:50])

    # Sanitize members — no full by-id paths
    members_out = []
    for m in result.get("members") or []:
        label = sn_label_from_member(m.get("member") or "")
        members_out.append(
            {
                "label": label,
                "role": LABEL_TO_ROLE.get(label),
                "dev": m.get("dev"),  # nvmeXn1 — OK public (not serial)
                "negotiated": m.get("negotiated"),
                "capable": m.get("capable"),
                "link_gbps": m.get("link_gbps"),
            }
        )

    chapters = build_chapters(result, windows, t0_ms, last_ms, profile, active_roles)
    pmeta = profile_meta(profile, result, cell.name)
    source_cell = cell.name

    meta = {
        "schema": pmeta["schema"],
        "result_schema": "docs/result-schema.md",
        "result_schema_note": (
            "Pack reverse-mapped from sealed cell + docs/result-schema.md; "
            "public pack uses SN labels only (no full disk paths)."
        ),
        "playback_role": pmeta["playback_role"],
        "source_cell": source_cell,
        "host": "sut",  # redact real hostname for promote-safe pack
        "suite": result.get("suite"),
        "mode": result.get("mode"),
        "layout": result.get("layout"),
        "primarycache": (result.get("params") or {}).get("primarycache"),
        "protocol": (result.get("params") or {}).get("protocol"),
        "protocol_label": pmeta["protocol_label"],
        "playback_badge": pmeta["playback_badge"],
        "story_sealed": False,
        "note": pmeta["note"],
        "pool": result.get("pool"),
        "ceiling_gbps": result.get("ceiling_gbps"),
        "ceiling_members": result.get("ceiling_members"),
        "usable_tib": result.get("usable_tib"),
        "harness_commit": "redacted",
        "pool_state": result.get("pool_state"),
        "nActive": len(active_roles),
        "activeRoles": list(active_roles),
        "vdevs": [
            {
                "vdev": (
                    # strip model/serial from vdev name when it embeds SN
                    (v.get("vdev") or "").rsplit("_", 1)[-1]
                    if isinstance(v.get("vdev"), str) and "_SN" in (v.get("vdev") or "")
                    else ("disk" if (v.get("type") == "disk") else v.get("vdev"))
                ),
                "type": v.get("type"),
                "nparity": v.get("nparity"),
                "members": [
                    _public_member_label(m) for m in (v.get("members") or [])
                ],
            }
            for v in (result.get("vdevs") or [])
        ],
        "members": members_out,
        "os_seat": (
            next(
                (
                    {"label": lab, "role": role, "dev": bdev, "active": True}
                    for lab, role, _ctrl, bdev in seats
                    if role == "os-x4"
                ),
                {"label": "OSDISK", "role": "os-x4", "dev": "nvme2n1", "active": False},
            )
        ),
        "column_map": {
            "epoch_ms": "epoch_ms",
            "temps": {
                "SN1": "ssd_temp_nvme0_composite_c",
                "SN2": "ssd_temp_nvme1_composite_c",
                "SN3": "ssd_temp_nvme3_composite_c",
                "SN4": "ssd_temp_nvme4_composite_c",
                "OSDISK": "ssd_temp_nvme2_composite_c",
            },
            "disk_bw": {
                "SN1": "disk_nvme0n1_{read,write}_bytes_per_s",
                "SN2": "disk_nvme1n1_{read,write}_bytes_per_s",
                "SN3": "disk_nvme3n1_{read,write}_bytes_per_s",
                "SN4": "disk_nvme4n1_{read,write}_bytes_per_s",
            },
            "note": (
                "Controller indices are sparse: members use nvme0,1,3,4; nvme2 is OS. "
                "Columns follow controller ids, not dense 0..3. "
                "Only activeRoles contribute to pool bw / glow."
            ),
        },
        "telemetry": {
            "file": "telemetry.min.json",
            "rows": len(ticks),
            "t0_epoch_ms": t0_ms,
            "hz": 1,
            "columns": [
                "t",
                "epoch_ms",
                "drives[].tempC",
                "drives[].tempCtrlC",
                "drives[].tempNandC",
                "drives[].readGBs",
                "drives[].writeGBs",
                "pool.readGBs",
                "pool.writeGBs",
                "platform.*",
            ],
            "hwmon_joined": has_hwmon,
            "sensor_schema": "docs/sensor-schema.md",
        },
        "chapters": chapters,
        "cell2_fields_todo": {
            "note": (
                "Thermal/SMART companion fields — wire when present in a promoted pack "
                "(still not a story promote unless Publisher says so)."
            ),
            "tests.<case>.thermal": [
                "baseline_c", "pre_min_c", "decision",
                "before_c", "after_c", "max_during_c",
                "lead_in_10s", "lead_out_10s",
                "idle_before_s", "idle_after_s",
            ],
            "telemetry_1hz_smart": "SMART sensors/throttle/data-units per member at 1 Hz",
            "companions": ["thermal-<case>.json", "zpool-1hz.raw"],
        },
    }

    # Sanitize vdev members that still look like paths
    for v in meta["vdevs"]:
        cleaned = []
        for m in v.get("members") or []:
            cleaned.append(_public_member_label(m))
        v["members"] = cleaned
        if isinstance(v.get("vdev"), str) and ("by-id" in v["vdev"] or "Lexar" in v["vdev"]):
            # already SN-suffixed above; force SN label if possible
            lab = sn_label_from_member(v["vdev"])
            v["vdev"] = lab if lab != "SN?" else "disk"

    out.mkdir(parents=True, exist_ok=True)
    (out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (out / "telemetry.min.json").write_text(json.dumps(ticks, separators=(",", ":")) + "\n")

    # Sanity: prefer a mid tick from first STO-01 read chapter if present
    probe = next((c for c in chapters if "seq_read" in c["id"] and "j4" in c["id"]), None)
    if not probe:
        probe = next((c for c in chapters if "read" in c["id"]), None)
    if probe:
        mid = (probe["begin_ms"] + probe["end_ms"]) // 2
        near = min(ticks, key=lambda x: abs(x["epoch_ms"] - mid))
        print(
            f"{probe['id']} mid tick pool readGBs=",
            near["pool"]["readGBs"],
            "headline=",
            probe["headline"],
            "activeRoles=",
            probe["activeRoles"],
        )
    print(
        f"wrote {out}/meta.json profile={profile} chapters={len(chapters)} "
        f"ticks={len(ticks)} nActive={len(active_roles)} roles={active_roles} hwmon={has_hwmon}"
    )

    # Sanitize checks
    meta_obj = json.loads((out / "meta.json").read_text())
    tick_blob = (out / "telemetry.min.json").read_text()[:50000]
    scan = (
        json.dumps(meta_obj.get("members"))
        + json.dumps(meta_obj.get("vdevs"))
        + json.dumps(meta_obj.get("os_seat"))
        + json.dumps(meta_obj.get("chapters"))
        + tick_blob
    )
    for bad in ("by-id", "Lexar_SSD", "/dev/disk", "dendrite"):
        if bad in scan:
            raise SystemExit(f"SANITIZE FAIL: found {bad!r} in pack payloads")
    if meta_obj.get("host") not in (None, "sut"):
        raise SystemExit(f"SANITIZE FAIL: host must be generic 'sut', got {meta_obj.get('host')!r}")
    if meta_obj.get("harness_commit") not in (None, "redacted"):
        raise SystemExit(
            f"SANITIZE FAIL: harness_commit must be omitted or 'redacted', got {meta_obj.get('harness_commit')!r}"
        )
    if meta_obj.get("story_sealed") is not False:
        raise SystemExit("SANITIZE FAIL: story_sealed must be false")
    return meta_obj


def main():
    ap = argparse.ArgumentParser(description="Build sanitized telemetry-viz pack from sealed cell")
    ap.add_argument(
        "--result-dir",
        type=Path,
        default=DEFAULT_CELL,
        help="Sealed cell directory (must contain DONE, result.json, telemetry-1hz.csv)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="Output directory for meta.json + telemetry.min.json",
    )
    ap.add_argument(
        "--profile",
        choices=["auto", "calibrate", "cell1-single", "stage1"],
        default="auto",
        help="Pack profile (auto detects from layout/mode; stage1 = Simulator full chapters)",
    )
    args = ap.parse_args()
    cell = args.result_dir if args.result_dir.is_absolute() else ROOT / args.result_dir
    out = args.out if args.out.is_absolute() else ROOT / args.out
    build_pack(cell, out, profile=None if args.profile == "auto" else args.profile)


if __name__ == "__main__":
    main()
