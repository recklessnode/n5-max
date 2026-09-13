#!/usr/bin/env python3
"""Build site/data/test-cases-index.json from docs/test-cases/*.md when present.

Expected per-file headings: Title / TCID, Objective, Requirements, Procedure,
Pass/Fail, Comments, Configurations. Until that directory exists, writes an
empty cases map so the matrix modal shows 'doc not yet published'.
"""
from __future__ import annotations
import json, re
from datetime import datetime, timezone
from pathlib import Path

HEAD = {
    "objective": "objective",
    "requirements": "requirements",
    "requirements / hardware": "requirements",
    "hardware": "requirements",
    "procedure": "procedure",
    "pass/fail": "pass_fail",
    "pass / fail": "pass_fail",
    "comments": "comments",
    "configurations": "configurations",
    "config": "configurations",
}

def parse_md(text: str, fallback_id: str) -> dict:
    title = fallback_id
    tcid = fallback_id
    m = re.search(r"^#\s+(.+)$", text, re.M)
    if m:
        title = m.group(1).strip()
    m = re.search(r"(?i)^(?:TCID|id)\s*[:=]\s*`?([A-Za-z0-9._-]+)`?", text, re.M)
    if m:
        tcid = m.group(1)
    sections = {k: "" for k in ("objective", "requirements", "procedure", "pass_fail", "comments", "configurations")}
    cur = None
    body = []
    for line in text.splitlines():
        hm = re.match(r"^##\s+(.+)$", line)
        if hm:
            if cur:
                sections[cur] = "\n".join(body).strip()
            key = HEAD.get(hm.group(1).strip().lower())
            cur = key
            body = []
            continue
        if cur:
            body.append(line)
    if cur:
        sections[cur] = "\n".join(body).strip()
    return {"id": tcid, "tcid": tcid, "title": title, **sections}

def main():
    repo = Path(__file__).resolve().parents[1]
    src = repo / "docs" / "test-cases"
    dst = repo / "site" / "data" / "test-cases-index.json"
    cases = {}
    generated = None
    if src.is_dir():
        for md in sorted(src.glob("*.md")):
            doc = parse_md(md.read_text(), md.stem)
            cases[doc["id"]] = doc
        generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    dst.write_text(json.dumps({
        "schema": "n5-test-cases-index/v1",
        "source": "docs/test-cases/",
        "generated_at": generated,
        "note": "Empty until docs/test-cases/ per-case markdown lands on main." if not cases else None,
        "cases": cases,
    }, indent=2) + "\n")
    print(f"wrote {dst} cases={len(cases)}")

if __name__ == "__main__":
    main()
