#!/usr/bin/env python3
"""Build site/data/test-cases-index.json from docs/test-cases/*.md.

Keys are case-family ids (STO-01, PRE-00, SOAK-01, …). The matrix modal
resolves sealed subcase ids like STO-01_seq_read_1M_j4 by family prefix.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

# Heading text (lower) → section key. Pass/Fail Criteria both fold into pass_fail.
HEAD = {
    "objective": "objective",
    "requirements": "requirements",
    "requirements / hardware": "requirements",
    "hardware": "requirements",
    "hardware requirements": "requirements",
    "procedure": "procedure",
    "pass/fail": "pass_fail",
    "pass / fail": "pass_fail",
    "pass criteria": "pass_fail",
    "fail criteria": "pass_fail",
    "comments": "comments",
    "configurations": "configurations",
    "config": "configurations",
}

FAMILY_RE = re.compile(r"^[A-Z]+-\d+$")
# Strip lab-local / serial-ish leaks from published doc text.
BAD_RE = re.compile(
    r"(?i)(/dev/disk/by-id/\S+|by-id/\S+|drives\.local|"
    r"dendrite-[a-z0-9._-]*sut|"
    r"\b[0-9a-f]{4}:[0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f]\b|"
    r"\b(WD|Samsung|Lexar|Crucial|Seagate)[_\-]?[A-Z0-9]{6,}\b|"
    r"results/\S+)"
)


def sanitize(text: str) -> str:
    if not text:
        return ""
    out = []
    for line in text.splitlines():
        if BAD_RE.search(line):
            line = BAD_RE.sub("[redacted]", line)
        out.append(line)
    return "\n".join(out).strip()


def parse_md(text: str, fallback_id: str) -> dict | None:
    title = fallback_id
    m = re.search(r"^#\s+(.+)$", text, re.M)
    if m:
        title = m.group(1).strip()

    tcid = fallback_id
    m = re.search(
        r"(?i)\*\*Case id:\*\*\s*`?([A-Za-z0-9._-]+)`?"
        r"|^(?:TCID|id|Case id)\s*[:=]\s*`?([A-Za-z0-9._-]+)`?",
        text,
        re.M,
    )
    if m:
        tcid = next(g for g in m.groups() if g)

    if not FAMILY_RE.match(tcid) and FAMILY_RE.match(fallback_id):
        tcid = fallback_id
    if not FAMILY_RE.match(tcid):
        return None  # skip README / non-case docs

    sections: dict[str, list[str]] = {
        k: [] for k in ("objective", "requirements", "procedure", "pass_fail", "comments", "configurations")
    }
    cur = None
    last_heading = None
    for line in text.splitlines():
        hm = re.match(r"^##\s+(.+)$", line)
        if hm:
            heading = hm.group(1).strip()
            key = HEAD.get(heading.lower())
            cur = key  # None for unmapped headings (Estimated duration, etc.)
            if key == "pass_fail":
                label = heading.strip()
                if sections["pass_fail"]:
                    sections["pass_fail"].append("")
                sections["pass_fail"].append(f"### {label}")
                sections["pass_fail"].append("")
            last_heading = heading
            continue
        if cur:
            sections[cur].append(line)

    def join(key: str) -> str:
        return sanitize("\n".join(sections[key]).strip())

    pass_fail = re.sub(r"\n{3,}", "\n\n", join("pass_fail"))

    return {
        "id": tcid,
        "tcid": tcid,
        "title": sanitize(title),
        "objective": join("objective"),
        "requirements": join("requirements"),
        "procedure": join("procedure"),
        "pass_fail": pass_fail,
        "comments": join("comments"),
        "configurations": join("configurations"),
    }


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    src = repo / "docs" / "test-cases"
    dst = repo / "site" / "data" / "test-cases-index.json"
    cases: dict[str, dict] = {}
    generated = None
    if src.is_dir():
        for md in sorted(src.glob("*.md")):
            if md.name.upper() == "README.MD":
                continue
            doc = parse_md(md.read_text(encoding="utf-8"), md.stem)
            if not doc:
                continue
            cases[doc["id"]] = doc
        generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload = {
        "schema": "n5-test-cases-index/v1",
        "source": "docs/test-cases/",
        "generated_at": generated,
        "note": (
            "Empty until docs/test-cases/ per-case markdown lands on main."
            if not cases
            else "Keyed by case-family id; matrix resolves STO-01_* → STO-01 via prefix."
        ),
        "cases": cases,
    }
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {dst} cases={len(cases)} ids={sorted(cases)}")


if __name__ == "__main__":
    main()
