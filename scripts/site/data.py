"""Lookups into data/sealed-metrics.json for the results site.

Every number the site prints goes through ``Ref`` so the page can name where it came from.
A ref path looks like ``zfs_stage12_cold[layout_full=stage1-raidz1-full].tests.STO-01_seq_read_1M_j4.bw_gbps``:
dotted keys, with ``[key=value]`` picking one element of a list. ``resolve`` is shared with the tests.
"""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_PATH = os.path.join(ROOT, "data", "sealed-metrics.json")



class LookupError_(Exception):
    pass


def load():
    with open(DATA_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def _tokens(path):
    out = []
    pos = 0
    for part in re.findall(r"\[[^\]]*\]|[^.\[]+", path):
        out.append(part)
    return out


def resolve(data, path):
    """Return the value at ``path``; raise if any step is missing or ambiguous."""
    cur = data
    toks = _tokens(path)
    i = 0
    while i < len(toks):
        tok = toks[i]
        if tok.startswith("["):
            conds = []
            for c in tok[1:-1].split("&"):
                if "^=" in c:
                    k, v = c.split("^=", 1)
                    conds.append((k, v, True))
                else:
                    k, v = c.split("=", 1)
                    conds.append((k, v, False))
            if not isinstance(cur, list):
                raise LookupError_(f"{path}: {tok} applied to non-list")
            hits = [e for e in cur if isinstance(e, dict) and all(
                (str(e.get(k, "")).startswith(v) if pre else str(e.get(k)) == v) for k, v, pre in conds)]
            if len(hits) != 1:
                raise LookupError_(f"{path}: {tok} matched {len(hits)} records")
            cur = hits[0]
            i += 1
            continue
        if not isinstance(cur, dict):
            raise LookupError_(f"{path}: {tok!r} applied to non-dict")
        # metric keys may themselves contain dots (e.g. "depth.tg128.d55000"): take the longest match
        for j in range(len(toks), i, -1):
            if any(t.startswith("[") for t in toks[i:j]):
                continue
            key = ".".join(toks[i:j])
            if key in cur:
                cur = cur[key]
                i = j
                break
        else:
            raise LookupError_(f"{path}: missing key {tok!r}")
    return cur


def fmt_number(v, kind):
    """Display rules (shared with tests).

    gbps / tib / ratio-as-stored: printed exactly as sealed (no re-rounding).
    iops / count: integer with thousands separators.
    toks: 2 dp when the sealed value carries more than 2 decimals.
    pct: as sealed.
    s: seconds as sealed, thousands separators.
    """
    if v is None:
        raise LookupError_("None value cannot be printed")
    if kind in ("iops", "count"):
        if float(v) != int(v):
            raise LookupError_(f"non-integer {v} for {kind}")
        return f"{int(v):,}"
    if kind == "toks":
        s = repr(float(v))
        dec = s.split(".")[1] if "." in s else ""
        return f"{v:,.2f}" if len(dec) > 2 else _plain(v)
    if kind == "s":
        if float(v) == int(v):
            return f"{int(v):,}"
        return _plain(v)
    if kind in ("gbps", "tib", "pct", "x", "c", "mbps", "w", "plain"):
        return _plain(v)
    raise LookupError_(f"unknown format kind {kind}")


def _plain(v):
    if isinstance(v, int):
        return f"{v:,}" if abs(v) >= 10000 else str(v)
    s = repr(float(v))
    if s.endswith(".0"):
        s = s[:-2]
    if "e" in s:
        raise LookupError_(f"refusing exponent format for {v}")
    ip, _, dp = s.partition(".")
    if abs(float(v)) >= 10000:
        ip = f"{int(ip):,}"
    return ip + ("." + dp if dp else "")


DERIVED = {
    # name: (arity, function, display kind)
    "ratio": (2, lambda a, b: round(a / b, 2), "x"),
    "minutes": (1, lambda s: round(s / 60), "plain"),
    "pct_of": (2, lambda a, b: round(100 * a / b, 1), "pct"),
}


def derive(data, name, paths):
    arity, fn, kind = DERIVED[name]
    if len(paths) != arity:
        raise LookupError_(f"{name} wants {arity} inputs")
    vals = [resolve(data, p) for p in paths]
    return fn(*vals), kind
