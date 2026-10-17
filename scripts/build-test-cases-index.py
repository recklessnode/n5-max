#!/usr/bin/env python3
"""Build site/data/test-cases-index.full.json from docs/test-cases/*.md (lab-only).

Keys are case-family ids (STO-01, PRE-00, SOAK-01, …). Sealed subcase ids
(STO-01_seq_read_1M_j4, …) are also keyed to the same family doc so the
matrix modal's exact-match lookup works without JS changes (density PR owns
matrix.js/css).
"""
from __future__ import annotations

import json
import subprocess
import re
from datetime import datetime, timezone
from pathlib import Path

def git_updated(md_path) -> str:
    """The doc's last-commit date (YYYY-MM-DD) — one home for `updated`, so it never drifts from the actual edit."""
    try:
        d = subprocess.run(["git", "log", "-1", "--format=%cs", "--", md_path.name],
                           capture_output=True, text=True, cwd=str(md_path.parent)).stdout.strip()
        return d or ""
    except Exception:
        return ""


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
# Sealed / mentioned subcase ids: FAMILY_rest
SEALED_RE = re.compile(r"\b([A-Z]+-\d+_[A-Za-z0-9._-]+)\b")
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



def created_dates(repo: Path) -> dict[str, str]:
    """Map test-case stem → YYYY/MM/DD from first git add of docs/test-cases/*.md."""
    out: dict[str, str] = {}
    try:
        raw = subprocess.check_output(
            [
                "git",
                "-C",
                str(repo),
                "log",
                "--diff-filter=A",
                "--reverse",
                "--format=%as",
                "--name-only",
                "--",
                "docs/test-cases/",
            ],
            text=True,
        )
    except Exception:
        return out
    date = None
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue  # keep current date across blank lines after %as
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", line):
            date = line
            continue
        if date and line.startswith("docs/test-cases/") and line.endswith(".md"):
            stem = Path(line).stem
            if stem not in out:
                y, m, d = date.split("-")
                out[stem] = f"{y}/{m}/{d}"
    return out


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """(fields, body). YAML-lite: the block between the first two '---' lines, one `key: value` per line.
    The three public fields (id, title, subtitle) live ONLY here — one home, no duplication with the H1."""
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end < 0:
        return {}, text
    fields = {}
    for line in text[4:end].splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fields[k.strip()] = re.sub(r"\s+#.*$", "", v).strip()
    return fields, text[end + 4:].lstrip("\n")


def parse_md(text: str, fallback_id: str, md_path=None) -> dict | None:
    fm, body = parse_frontmatter(text)
    # frontmatter is authoritative; fall back to the old H1 + **Case id:** for any doc not yet migrated
    tcid = fm.get("id") or fallback_id
    title = fm.get("title")
    subtitle = fm.get("subtitle", "") or ""
    if title is None:
        m = re.search(r"^#\s+(.+)$", text, re.M)
        title = m.group(1).strip() if m else fallback_id
        # strip a leading "ID — " that older H1s embed, so the title never carries the id
        title = re.sub(r"^[A-Z]+-\d+\s+[—–-]\s+", "", title)
        m = re.search(r"(?i)\*\*Case id:\*\*\s*`?([A-Za-z0-9._-]+)`?", text)
        if m:
            tcid = m.group(1)
    text = body if fm else text   # section scan runs on the body (below the frontmatter)

    if not FAMILY_RE.match(tcid) and FAMILY_RE.match(fallback_id):
        tcid = fallback_id
    if not FAMILY_RE.match(tcid):
        return None

    sections: dict[str, list[str]] = {
        k: [] for k in ("objective", "requirements", "procedure", "pass_fail", "comments", "configurations")
    }
    cur = None
    for line in text.splitlines():
        hm = re.match(r"^##\s+(.+)$", line)
        if hm:
            heading = hm.group(1).strip()
            key = HEAD.get(heading.lower())
            cur = key
            if key == "pass_fail":
                if sections["pass_fail"]:
                    sections["pass_fail"].append("")
                sections["pass_fail"].append(f"### {heading}")
                sections["pass_fail"].append("")
            continue
        if cur:
            sections[cur].append(line)

    def join(key: str) -> str:
        return sanitize("\n".join(sections[key]).strip())

    pass_fail = re.sub(r"\n{3,}", "\n\n", join("pass_fail"))
    sealed = set(SEALED_RE.findall(text))
    fm_sealed = fm.get("sealed_as", "").strip("[] ")
    if fm_sealed:
        sealed |= {t.strip() for t in fm_sealed.split(",") if t.strip()}
    sealed = sorted(sealed)

    created = (fm.get("created") or fm.get("date_created") or fm.get("date") or "").strip().replace("-", "/")
    if not re.fullmatch(r"\d{4}/\d{2}/\d{2}", created):
        created = ""
    # `updated` is DERIVED from git (last commit touching the doc) — one home, never hand-maintained; falls back to created
    updated = (git_updated(md_path) if md_path else "").replace("-", "/") or created
    priority = (fm.get("priority") or "").strip().lower()   # human field: critical | high | medium | low

    return {
        "id": tcid,
        "title": sanitize(title),
        "subtitle": sanitize(subtitle),
        "created": created,
        "updated": updated,
        "priority": priority,
        "objective": join("objective"),   # the description body (## Objective); one home, not duplicated
        "requirements": join("requirements"),
        "procedure": join("procedure"),
        "pass_fail": pass_fail,
        "comments": join("comments"),
        "configurations": join("configurations"),
        "_sealed": sealed,  # builder-only; stripped before write
    }


def collect_status_ids(status_path: Path) -> set[str]:
    if not status_path.is_file():
        return set()
    out: set[str] = set()

    def walk(o):
        if isinstance(o, dict):
            cid = o.get("id")
            if isinstance(cid, str) and "_" in cid:
                out.add(cid)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for x in o:
                walk(x)

    walk(json.loads(status_path.read_text(encoding="utf-8")))
    return out


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    src = repo / "docs" / "test-cases"
    dst = repo / "site" / "data" / "test-cases-index.full.json"
    families: dict[str, dict] = {}
    dates = created_dates(repo)
    sealed_from_docs: dict[str, str] = {}  # sealed_id -> family
    generated = None
    if src.is_dir():
        for md in sorted(src.glob("*.md")):
            if md.name.upper() == "README.MD":
                continue
            doc = parse_md(md.read_text(encoding="utf-8"), md.stem, md_path=md)
            if not doc:
                continue
            if not doc.get("created"):
                doc["created"] = dates.get(md.stem, "")
            fam = doc["id"]
            for sid in doc.pop("_sealed", []):
                # Map SOAK-00 probe under SOAK-01 family file
                target = fam
                m = re.match(r"^([A-Z]+-\d+)_", sid)
                if m and m.group(1) in families or m and m.group(1) == fam:
                    # Prefer own family if that family doc exists; else this file
                    target = m.group(1) if m.group(1) == fam else fam
                sealed_from_docs[sid] = target
            families[fam] = doc
        generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Fix sealed→family using family prefix when that family exists
    for sid in list(sealed_from_docs):
        m = re.match(r"^([A-Z]+-\d+)_", sid)
        if m and m.group(1) in families:
            sealed_from_docs[sid] = m.group(1)

    for sid in collect_status_ids(repo / "campaign" / "status.json"):
        m = re.match(r"^([A-Z]+-\d+)_", sid)
        if m and m.group(1) in families:
            sealed_from_docs[sid] = m.group(1)

    cases: dict[str, dict] = dict(families)
    aliased = 0
    for sid, fam in sorted(sealed_from_docs.items()):
        if fam not in families:
            continue
        if sid not in cases:
            cases[sid] = families[fam]
            aliased += 1

    payload = {
        "schema": "n5-test-cases-index/v1",
        "source": "docs/test-cases/",
        "generated_at": generated,
        "note": (
            "Empty until docs/test-cases/ per-case markdown lands on main."
            if not families
            else (
                "Keyed by case-family id; sealed subcase ids aliased to the same "
                "doc so matrix exact-match works (density PR owns matrix.js)."
            )
        ),
        "cases": cases,
    }
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(
        f"wrote {dst} families={len(families)} total_keys={len(cases)} "
        f"aliased={aliased} ids={sorted(families)}"
    )


if __name__ == "__main__":
    main()
