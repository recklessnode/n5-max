#!/usr/bin/env python3
"""Build public-safe slim test-cases-index.json (SANITIZED ONLY).

Public modal fields: id, title, objective, pass_fail.
No procedure/comments/configurations/requirements. Scrubs lab leaks.
Lab keeps full docs + full index private. Never copy docs/test-cases/*.md
to the public repo.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

DROP_LINE_RE = re.compile(
    r"(?i)("
    r"results/|dendrite-[a-z0-9._-]*sut|drives\.local|/dev/disk/by-id|by-id/|"
    r"[0-9a-f]{4}:[0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f]|00:[0-9a-fA-F]{2}\.[0-9a-fA-F]|"
    r"LnkSta|LnkCap|protocol-[ab]-|derived-ramps|suites/storage|lib/atoms|lib/rails|"
    r"bin/dendrite|journal\.jsonl|metrics\.jsonl|fio\s+--|"
    r"--ioengine|--iodepth|--ramp_time=|--runtime=|DENDRITE_[A-Z0-9_]+|"
    r"\$BENCHFILE|\$POOL\b|\$PC\b|atom_[a-z_]+|terminate\(\)"
    r")"
)
INLINE_RE = re.compile(
    r"(?i)(/dev/disk/by-id/\S+|by-id/\S+|drives\.local|dendrite-[a-z0-9._-]*sut|"
    r"results/\S+|`?atom_[a-z_]+`?|"
    r"\d+(?:\.\d+)?\s*(?:GB|GiB|MB|MiB)/s|"
    r"[0-9a-f]{4}:[0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f])"
)
CAL_RE = re.compile(r"(?i)\bcalibrat(?:e|ion|ed|ing)\b[^.]*\.?")
RATE_RE = re.compile(r"(?i)\b(?:GB|GiB|MB|MiB)/s\b")
GBPS_RE = re.compile(r"(?i)\b(?:read_|write_|bw_)?gbps\b|\bCEILING_GBPS\b")
FAMILY_RE = re.compile(r"^([A-Z]+-\d+)")
FORBIDDEN = (
    "result_dir", "results/", "by-id", "drives.local", "dendrite-sut", "192.168",
    "GB/s", "GiB/s", "MB/s", "MiB/s", "gbps", "CEILING_GBPS", "calibrat", "fio --", "atom_",
    "suites/storage", "lib/atoms", "bin/dendrite", "journal.jsonl", "derived-ramps",
)


def scrub_block(text: str, max_chars: int) -> str:
    if not text:
        return ""
    keep = []
    for line in text.splitlines():
        if DROP_LINE_RE.search(line):
            continue
        line = INLINE_RE.sub("[redacted]", line)
        line = CAL_RE.sub("", line)
        line = RATE_RE.sub("[rate]", line)
        line = GBPS_RE.sub("[rate]", line)
        line = re.sub(r"[ \t]{2,}", " ", line).rstrip()
        if not line.strip() or line.strip().startswith("```"):
            if keep and keep[-1] != "":
                keep.append("")
            continue
        keep.append(line)
    out = re.sub(r"\n{3,}", "\n\n", "\n".join(keep)).strip()
    out = re.sub(r"(?m)^(### .+)\n+(?=### |\Z)", "", out).strip()
    if len(out) > max_chars:
        cut = out[:max_chars]
        if "\n" in cut:
            cut = cut.rsplit("\n", 1)[0]
        out = cut.rstrip(" ,;") + "…"
    return out


def public_doc(full: dict) -> dict:
    return {
        "id": full.get("id") or full.get("tcid"),
        "tcid": full.get("tcid") or full.get("id"),
        "title": (full.get("title") or "").strip(),
        "objective": scrub_block(full.get("objective") or "", 800),
        "pass_fail": scrub_block(full.get("pass_fail") or "", 1000),
    }


def load_builder(repo: Path):
    spec = importlib.util.spec_from_file_location(
        "tc_builder", repo / "scripts" / "build-test-cases-index.py"
    )
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def from_docs(repo: Path):
    mod = load_builder(repo)
    families, sealed_map = {}, {}
    for md in sorted((repo / "docs" / "test-cases").glob("*.md")):
        if md.name.upper() == "README.MD":
            continue
        doc = mod.parse_md(md.read_text(encoding="utf-8"), md.stem)
        if not doc:
            continue
        sealed = doc.pop("_sealed", [])
        fam = doc["id"]
        families[fam] = doc
        for sid in sealed:
            sealed_map[sid] = fam
    for sid in list(sealed_map):
        m = FAMILY_RE.match(sid)
        if m and m.group(1) in families:
            sealed_map[sid] = m.group(1)
        elif sid.startswith("SOAK-00") and "SOAK-01" in families:
            sealed_map[sid] = "SOAK-01"
    status = repo / "campaign" / "status.json"
    if status.is_file():
        def walk(o, out):
            if isinstance(o, dict):
                if isinstance(o.get("id"), str) and "_" in o["id"]:
                    out.add(o["id"])
                for v in o.values():
                    walk(v, out)
            elif isinstance(o, list):
                for x in o:
                    walk(x, out)
        found = set()
        walk(json.loads(status.read_text()), found)
        for sid in found:
            m = FAMILY_RE.match(sid)
            if m and m.group(1) in families:
                sealed_map[sid] = m.group(1)
    return families, sealed_map


def gate(cases: dict) -> None:
    blob = json.dumps(cases)
    for bad in FORBIDDEN:
        if bad in blob:
            for k, v in cases.items():
                if bad in json.dumps(v):
                    sys.exit(f"public sanitize failed: {bad!r} in case {k}")
            sys.exit(f"public sanitize failed: {bad!r} present")


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("dst", nargs="?", default=str(repo / "site" / "data" / "test-cases-index.public.json"))
    args = ap.parse_args()
    families, sealed_map = from_docs(repo)
    cases = {fam: public_doc(full) for fam, full in families.items()}
    for sid, fam in sealed_map.items():
        if fam in cases and sid not in cases:
            cases[sid] = cases[fam]
    gate(cases)
    payload = {
        "schema": "n5-test-cases-index/v1",
        "source": "docs/test-cases/ (public-sanitized)",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": (
            "Public-safe slim fields only (id/title/objective/pass_fail). "
            "Full docs stay private in lab. Sealed ids aliased to family docs."
        ),
        "cases": cases,
    }
    dst = Path(args.dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {dst} families={len(families)} keys={len(cases)}")


if __name__ == "__main__":
    main()
