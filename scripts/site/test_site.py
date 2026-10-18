#!/usr/bin/env python3
"""Checks for the results site. Run: python3 scripts/site/test_site.py

Proves that (a) every number and chart point on index.html is a lookup into data/sealed-metrics.json,
(b) every configuration the explorer offers is a real result record, and (c) nothing on the page lets a
visitor set a chart value by hand (static scan + an in-browser audit in headless Chrome).
"""
import functools
import html
import http.server
import json
import os
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import unittest
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import data as D  # noqa: E402

ROOT = D.ROOT
INDEX = os.path.join(ROOT, "index.html")
DATA = D.load()


def read_index(path=INDEX):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def payload(page):
    m = re.search(r'<script type="application/json" id="n5-data">(.*?)</script>', page, re.S)
    return json.loads(m.group(1).replace("<\\/", "</"))


class Spans(HTMLParser):
    """Collect <span class="m"> lookups and the visible text outside them."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.spans, self.outside = [], []
        self._in, self._skip, self._cur = 0, 0, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style", "head"):
            self._skip += 1
        if tag == "span" and a.get("class") == "m":
            self._in += 1
            self._cur = {"src": a.get("data-src"), "kind": a.get("data-kind"), "derive": a.get("data-derive"), "text": ""}
        elif self._in:
            self._in += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head"):
            self._skip -= 1
        if self._in:
            self._in -= 1
            if self._in == 0 and self._cur is not None:
                self.spans.append(self._cur)
                self._cur = None

    def handle_data(self, d):
        if self._skip:
            return
        if self._in:
            self._cur["text"] += d
        else:
            self.outside.append(d)


# Measurement-looking text outside a lookup. A number glued to letters (tg128, pp512, Gen4) is a label.
MEASUREMENT = re.compile(r"(?<![A-Za-z\d.])\d[\d,.]*\s?(GB/s|MB/s|TiB|IOPS|tok/s|%|°C|×|s\b|min\b)")
# The only allowed exceptions: protocol parameters and label definitions, not results.
STATIC_OK = [
    r"filled to 50\s?% with",   # stage-7 fill level (protocol parameter)
    r"after the same 50\s?% fill",
    r"50\s?% fill, idle",
    r"so 100\s?% is the best",  # explorer axis definition
    r"≥2× spread",              # PROVISIONAL label definition
    r"\b[245]× ?(4 TB|×1|10GbE)",  # drive / port counts (5× 4 TB, 4× ×1, 2×10GbE)
]


class TestNumbersTraceToData(unittest.TestCase):
    def setUp(self):
        self.page = read_index()
        p = Spans()
        p.feed(self.page)
        self.parser = p

    def test_index_is_current_build(self):
        r = subprocess.run([sys.executable, os.path.join(HERE, "build.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_every_number_span_resolves(self):
        self.assertGreater(len(self.parser.spans), 150)
        for sp in self.parser.spans:
            if sp["derive"]:
                v, kind = D.derive(DATA, sp["derive"], sp["src"].split("|"))
            else:
                v, kind = D.resolve(DATA, sp["src"]), sp["kind"]
            self.assertEqual(D.fmt_number(v, kind), sp["text"].strip(), sp["src"])

    def test_no_measurement_outside_a_lookup(self):
        text = re.sub(r"\s+", " ", " ".join(self.parser.outside))
        hits = []
        for mt in MEASUREMENT.finditer(text):
            frag = text[max(0, mt.start() - 25): mt.end() + 12]
            if not any(re.search(pat, frag) for pat in STATIC_OK):
                hits.append(frag.strip())
        self.assertEqual(hits, [], "numbers with units that are not sealed lookups")


class TestChartsAndExplorer(unittest.TestCase):
    def setUp(self):
        self.p = payload(read_index())

    def test_static_chart_points_are_sealed_values(self):
        n = 0
        for c in self.p["charts"]:
            for s in c["series"]:
                self.assertEqual(len(s["values"]), len(c["labels"]))
                for v, src in zip(s["values"], s["src"]):
                    if src is None:
                        self.assertIsNone(v)
                        continue
                    self.assertEqual(v, D.resolve(DATA, src), src)
                    n += 1
        self.assertGreater(n, 30)

    def test_every_selectable_config_is_a_result_record(self):
        sections = {"cold": {"zfs_stage12_cold", "fs_controls_cold"}, "metadata": {"zfs_stage12_metadata"}, "warm": {"fs_controls_warm"}}
        axes = {a["key"] for a in self.p["explorer"]["axes"]}
        total = 0
        for r in self.p["explorer"]["regimes"]:
            want = sorted(e["layout_full"] for sec in sections[r["id"]] for e in DATA[sec])
            got = sorted(c["layout_full"] for c in r["configs"])
            self.assertEqual(got, want, f"regime {r['id']} offers exactly the records in {sections[r['id']]}")
            for c in r["configs"]:
                total += 1
                sec = c["base"].split("[", 1)[0]
                self.assertIn(sec, sections[r["id"]])
                rec = D.resolve(DATA, c["base"])
                self.assertEqual(rec["layout_full"], c["layout_full"])
                self.assertEqual(set(c["values"]), axes)
                for k, v in c["values"].items():
                    src = c["src"][k]
                    if v is None:
                        t = D.resolve(DATA, src.rsplit(".", 1)[0])
                        self.assertFalse(t.get("publishable"), f"{src} hidden but publishable")
                        self.assertIn(c["notes"][k], ("PROVISIONAL", "non-steady"))
                    else:
                        self.assertEqual(v, D.resolve(DATA, src), src)
        self.assertEqual(total, 28)

    def test_no_free_value_controls_in_source(self):
        page = read_index()
        with open(os.path.join(ROOT, "js", "results-charts.js"), encoding="utf-8") as fh:
            js = fh.read()
        for bad in [r'type="(range|number|text)"', r"contenteditable", r"<select", r"<textarea"]:
            self.assertIsNone(re.search(bad, page), bad)
        for bad in [r'type\s*=\s*"(range|number|text)"', r"dragData|chartjs-plugin-drag|onDrag", r"contentEditable", r"createElement\(\"(select|textarea)\"\)"]:
            self.assertIsNone(re.search(bad, js), bad)
        self.assertNotIn("interactive-compare.js", page)
        self.assertFalse(os.path.exists(os.path.join(ROOT, "js", "interactive-compare.js")))


def chrome():
    for c in ("google-chrome", "chromium", "chromium-browser"):
        p = shutil.which(c)
        if p:
            return p
    return None


def run_audit(root):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    handler.log_message = lambda *a, **k: None
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as srv:
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        url = f"http://127.0.0.1:{srv.server_address[1]}/index.html?selftest"
        out = subprocess.run([chrome(), "--headless=new", "--no-sandbox", "--disable-gpu", "--virtual-time-budget=10000",
                              "--dump-dom", url], capture_output=True, text=True, timeout=120).stdout
        srv.shutdown()
    m = re.search(r'<pre id="n5-selftest">(.*?)</pre>', out, re.S)
    return json.loads(html.unescape(m.group(1))) if m else None


@unittest.skipUnless(chrome(), "headless Chrome not installed")
class TestBrowserAudit(unittest.TestCase):
    def test_audit_passes(self):
        res = run_audit(ROOT)
        self.assertIsNotNone(res, "selftest did not run")
        self.assertTrue(res["ok"], res["fails"])
        self.assertEqual(res["checked"]["explorer_configs"], 28)
        self.assertGreater(res["checked"]["static_points"], 30)

    def test_audit_catches_a_slider(self):
        """Negative control: the audit must fail if anyone adds a value control back."""
        tmp = tempfile.mkdtemp()
        try:
            for d in ("css", "js", "data", "fonts"):
                shutil.copytree(os.path.join(ROOT, d), os.path.join(tmp, d))
            page = read_index().replace('<div id="ex-table"></div>',
                                        '<div id="ex-table"></div><input type="range" min="0" max="100" value="30">')
            open(os.path.join(tmp, "index.html"), "w", encoding="utf-8").write(page)
            res = run_audit(tmp)
            self.assertIsNotNone(res)
            self.assertFalse(res["ok"])
            self.assertTrue(any("free-value control" in f for f in res["fails"]), res["fails"])
        finally:
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main(verbosity=2)
