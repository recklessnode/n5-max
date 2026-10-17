#!/usr/bin/env python3
"""Build index.html for the N5 MAX results site from data/sealed-metrics.json.

Every measured number on the page is a lookup (``m`` / ``st`` / ``dv``) into the sealed metrics file and is
emitted as <span class="m" data-src=...> so tests can re-resolve it. Charts and the layout explorer are fed
from the same lookups (embedded JSON); the browser never computes or accepts a value of its own.

Usage: python3 scripts/site/build.py [--check]
  --check  rebuild in memory and fail if index.html differs (CI / tests).
"""
import html
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import data as D  # noqa: E402

OUT = os.path.join(D.ROOT, "index.html")
DATA = D.load()


class BuildError(Exception):
    pass


def esc(s):
    return html.escape(str(s), quote=True)


# ---------------------------------------------------------------- lookups -> spans
def m(path, kind, unit=""):
    v = D.resolve(DATA, path)
    txt = D.fmt_number(v, kind)
    u = f"&nbsp;{unit}" if unit else ""
    return f'<span class="m" data-src="{esc(path)}" data-kind="{kind}" title="{esc(path)}">{txt}</span>{u}'


def flags_of(test_path):
    t = D.resolve(DATA, test_path)
    return t


def st(test_path, field, kind, unit="", claim=True):
    """A storage test value with its seal flags. claim=True refuses non-publishable values."""
    t = flags_of(test_path)
    if claim and not t.get("publishable", False):
        raise BuildError(f"{test_path}.{field} is not publishable and cannot back a claim")
    out = m(f"{test_path}.{field}", kind, unit)
    if t.get("provisional"):
        out += ' <span class="tag prov" title="≥2× spread against its own history">PROVISIONAL</span>'
    elif t.get("steady") is False:
        out += ' <span class="tag ns" title="rails.steadiness.steady == false">non-steady</span>'
    return out


def dv(name, paths, unit=""):
    v, kind = D.derive(DATA, name, paths)
    txt = D.fmt_number(v, kind)
    u = f"&nbsp;{unit}" if unit else ""
    return f'<span class="m" data-derive="{name}" data-src="{esc("|".join(paths))}" data-kind="{kind}" title="{esc(name + ": " + " | ".join(paths))}">{txt}</span>{u}'


# ---------------------------------------------------------------- path helpers
def ZC(lf):
    return f"zfs_stage12_cold[layout_full={lf}]"


def ZM(lf):
    return f"zfs_stage12_metadata[layout_full={lf}]"


def FC(lf):
    return f"fs_controls_cold[layout_full={lf}]"


def FW(lf):
    return f"fs_controls_warm[layout_full={lf}]"


def T(base, test):
    return f"{base}.tests.{test}"


def AI(model, backend, pool):
    return f"ai_final[model={model}&backend={backend}&pool^={pool}].metrics"


def DG(layout):
    return f"degraded_stage7[layout={layout}]"


SEQR, SEQW = "STO-01_seq_read_1M_j4", "STO-01_seq_write_1M_j4"
R4R, R4W, R16W = "STO-02_rand_read_4k_j4", "STO-02_rand_write_4k_j4", "STO-02_rand_write_16k_j4"
MIX, SYNC = "STO-03_mixed_70r30w_16k_j4", "STO-04_sync_write_16k_j4"

RZ1, RZ2, R10 = ZC("stage1-raidz1-full"), ZC("stage2-raidz2-full"), ZC("stage1-raid10-full")
R10S = ZC("stage2-raid10+spare-full")
BR5, BR6, BR10 = FC("stage5-btrfs-raid5-full"), FC("stage5-btrfs-raid6-full"), FC("stage5-btrfs-raid10-full")
MD5, MD6, MD10 = FC("stage5-mdadm-ext4-raid5-full"), FC("stage5-mdadm-ext4-raid6-full"), FC("stage5-mdadm-ext4-raid10-full")
X1, X4 = ZC("stage1-single-x1-full"), ZC("stage2-single-x4-full")

LAYOUT_NAMES = {
    "single-x1": "Single drive · Gen4 ×1",
    "single-x4": "Single drive · Gen4 ×4",
    "mirror2": "ZFS mirror · 2 drives",
    "raid0": "ZFS stripe (RAID0) · control",
    "raid10": "ZFS RAID10 · 4× ×1",
    "raid10+spare": "ZFS RAID10 + hot spare",
    "raidz1": "ZFS RAIDZ1 · 5-wide",
    "raidz2": "ZFS RAIDZ2 · 5-wide",
    "btrfs-raid10": "btrfs raid10 · 4× ×1",
    "btrfs-raid5": "btrfs raid5 · 5-wide",
    "btrfs-raid6": "btrfs raid6 · 5-wide",
    "mdadm-ext4-raid10": "mdadm raid10 + ext4 · 4× ×1",
    "mdadm-ext4-raid5": "mdadm raid5 + ext4 · 5-wide",
    "mdadm-ext4-raid6": "mdadm raid6 + ext4 · 5-wide",
}
MODEL_NAMES = {
    "smoke-qwen3-0.6b-q8": "Qwen3 0.6B Q8 (smoke test)",
    "llama2-7b-q4-0": "Llama-2 7B Q4_0",
    "gpt-oss-20b-mxfp4": "gpt-oss-20b MXFP4",
    "gemma-4-26b-a4b-q4km": "Gemma 4 26B-A4B Q4_K_M",
    "qwen3.8-27b-ud-q4kxl": "Qwen3.8-27B dense Q4_K_XL",
    "qwen3.8-27b-ud-q8kxl": "Qwen3.8-27B dense Q8_K_XL",
    "gpt-oss-120b-mxfp4": "gpt-oss-120b MXFP4",
    "qwen3.5-122b-a10b-q4km": "Qwen3.5-122B-A10B Q4_K_M",
    "deepseek-v4-flash-0731-iq2xxs-antirez": "DeepSeek V4 Flash IQ2_XXS",
    "deepseek-v31-ud-q2kxl": "DeepSeek V3.1 Q2_K_XL",
    "kimi-k2-thinking-smol-iq1kt": "Kimi K2 Thinking IQ1",
}

CHARTS = []  # embedded chart specs: every value carries its src path


def series(label, paths, color):
    vals = []
    for p in paths:
        if p is None:
            vals.append(None)
            continue
        vals.append(D.resolve(DATA, p))
    return {"label": label, "values": vals, "src": paths, "color": color}


def chart(cid, ctype, title, labels, sers, unit, caption, **opts):
    CHARTS.append({"id": cid, "type": ctype, "title": title, "labels": labels, "series": sers, "unit": unit, **opts})
    return (f'<figure class="chart"><figcaption>{esc(title)}</figcaption>'
            f'<div class="chart-box{" tall" if opts.get("tall") else ""}"><canvas id="{cid}" role="img" aria-label="{esc(title)}"></canvas></div>'
            f'<p class="cap">{caption}</p></figure>')


def table(head, rows, cls="data"):
    h = "".join(f"<th>{c}</th>" for c in head)
    b = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="tbl"><table class="{cls}"><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table></div>'


TEAL, ORANGE, PURPLE, GREY, BLUE = "#1FA6A0", "#E86A2B", "#7c5cd6", "#8a8f96", "#3b82f6"


# ---------------------------------------------------------------- sections
def hero():
    meta = DATA["meta"]
    sealed = meta.get("story_sealed") is True
    status = ("Editorial seal complete" if sealed else
              "Editorial seal pending Publisher review")
    return f"""
<header class="hero" id="top">
  <div class="wrap">
    <p class="eyebrow">Minisforum N5 MAX · Ryzen AI Max+ 395 · 128&nbsp;GB unified memory · 5× 4&nbsp;TB NVMe</p>
    <h1>What the N5 MAX is good for, and how to set it up.</h1>
    <p class="sub">Measured results from a seven-stage campaign, organised by the workloads we bought the box for.
      Four of the five NVMe slots run at PCIe Gen4&nbsp;×1 and one at ×4, so the layout you choose matters more than the SSD.</p>
    <p class="status"><span class="tag final">Final campaign data · {esc(meta["generated"])}</span>
      <span class="tag pending">{status}</span>
      <span class="tag">Labels: <b>PROVISIONAL</b> = ≥2× spread vs its own history · <b>non-steady</b> = failed the steadiness rail</span></p>
  </div>
</header>"""


def at_a_glance():
    rows = [
        ["<a href='#ai-box'>Local AI and RAG box</a>",
         "<b>ZFS RAIDZ1</b> across all five NVMe; keep models resident in memory",
         f"{m(RZ1 + '.usable_tib', 'tib', 'TiB')} usable · {st(T(RZ1, SEQR), 'bw_gbps', 'gbps', 'GB/s')} cold reads · "
         f"{m(DG('zfs-raidz1') + '.ratios.' + SEQR + '.degraded_pct_of_healthy', 'pct', '%')} of reads kept with a drive out",
         "Supported"],
        ["<a href='#vm-server'>AI + VM server (Proxmox)</a>",
         "<b>ZFS RAID10</b> on the four ×1 drives for VM disks",
         f"sync 16K {st(T(R10, SYNC), 'iops', 'iops', 'IOPS')} vs {st(T(RZ1, SYNC), 'iops', 'iops', 'IOPS')} on RAIDZ1 · "
         f"mixed {st(T(R10, MIX), 'iops', 'iops', 'IOPS')}",
         "Supported · SATA tier and SLOG untested"],
        ["<a href='#archive'>Media and file archive</a>",
         "<b>ZFS RAIDZ2</b> 5-wide; RAIDZ1 if capacity matters more",
         f"{m(RZ2 + '.usable_tib', 'tib', 'TiB')} · {st(T(RZ2, SEQR), 'bw_gbps', 'gbps', 'GB/s')} cold reads · survives two failures · "
         f"rebuild {dv('minutes', [DG('zfs-raidz2') + '.rebuild_wall_s'], 'min')}",
         "Supported · network serving untested"],
        ["<a href='#big-models'>Models larger than memory</a>",
         "<b>No recommendation</b>",
         f"decode {m(AI('kimi-k2-thinking-smol-iq1kt', 'HIP', 'btrfs') + '.tg128_card', 'toks', 'tok/s')} to "
         f"{m(AI('deepseek-v31-ud-q2kxl', 'HIP', 'btrfs') + '.tg128_card', 'toks', 'tok/s')} on every pool tested",
         "Not usable interactively"],
    ]
    return f"""
<section id="verdict" class="band">
  <div class="wrap">
    <h2>Recommendations at a glance</h2>
    {table(["Use case", "Recommended configuration", "Backed by (measured)", "Status"], rows, "data glance")}
    <p class="note">Avoid for primary data: <a href="#avoid">btrfs raid5/6, mdadm parity for VMs, btrfs raid10 for single-stream reads</a>.</p>
  </div>
</section>"""


def story_ai():
    resident = [
        ("gpt-oss-20b-mxfp4", True), ("gemma-4-26b-a4b-q4km", True), ("gpt-oss-120b-mxfp4", True),
        ("qwen3.5-122b-a10b-q4km", True), ("qwen3.8-27b-ud-q4kxl", False), ("llama2-7b-q4-0", False),
        ("deepseek-v4-flash-0731-iq2xxs-antirez", False),
    ]
    rows = []
    for model, has_vk in resident:
        for be in (["HIP", "Vulkan"] if has_vk else ["HIP"]):
            p = AI(model, be, "btrfs")
            mt = D.resolve(DATA, p)
            tg55 = m(p + ".depth.tg128.d55000", "toks") if "depth.tg128.d55000" in mt else "—"
            rows.append([MODEL_NAMES[model], be, m(p + ".load.model_load_s", "s", "s"),
                         m(p + ".pp512_card", "toks"), m(p + ".tg128_card", "toks"), tg55])
    decode_models = [m_ for m_, vk in resident if vk]
    c1 = chart("c-ai-decode", "bar", "Decode speed (tg128, tok/s) by model and backend",
               [MODEL_NAMES[x] for x in decode_models],
               [series("HIP (ROCm)", [AI(x, "HIP", "btrfs") + ".tg128_card" for x in decode_models], TEAL),
                series("Vulkan (RADV)", [AI(x, "Vulkan", "btrfs") + ".tg128_card" for x in decode_models], ORANGE)],
               "tok/s", "llama-bench tg128 at depth 0, models resident in memory, loaded from cold btrfs raid5. Higher is better.",
               horizontal=True)
    depth_models = ["gpt-oss-20b-mxfp4", "gemma-4-26b-a4b-q4km", "gpt-oss-120b-mxfp4", "qwen3.5-122b-a10b-q4km"]
    depths = [("d0", "0"), ("d8192", "8k"), ("d32768", "32k"), ("d55000", "55k")]
    pal = [TEAL, ORANGE, PURPLE, BLUE]
    c2 = chart("c-ai-depth", "line", "Decode speed as the context fills (HIP, tok/s)",
               [lbl for _, lbl in depths],
               [series(MODEL_NAMES[x], [AI(x, "HIP", "btrfs") + f".depth.tg128.{d}" for d, _ in depths], pal[i])
                for i, x in enumerate(depth_models)],
               "tok/s", "tg128 measured at each context depth with f16 KV cache. KV-cache quantisation was not tested.")
    g_b, g_z = AI("gemma-4-26b-a4b-q4km", "HIP", "btrfs"), AI("gemma-4-26b-a4b-q4km", "HIP", "zfs")
    s_b, s_z = AI("smoke-qwen3-0.6b-q8", "HIP", "btrfs"), AI("smoke-qwen3-0.6b-q8", "HIP", "zfs")
    pool_rows = [
        [MODEL_NAMES["gemma-4-26b-a4b-q4km"], "btrfs raid5 · cold", m(g_b + ".load.model_load_s", "s", "s"), m(g_b + ".pp512_card", "toks"), m(g_b + ".tg128_card", "toks")],
        ["", "ZFS RAIDZ1 · ARC cold", m(g_z + ".load.model_load_s", "s", "s"), m(g_z + ".pp512_card", "toks"), m(g_z + ".tg128_card", "toks")],
        [MODEL_NAMES["smoke-qwen3-0.6b-q8"], "btrfs raid5 · cold", m(s_b + ".load.model_load_s", "s", "s"), m(s_b + ".pp512_card", "toks"), m(s_b + ".tg128_card", "toks")],
        ["", "ZFS RAIDZ1 · ARC cold", m(s_z + ".load.model_load_s", "s", "s"), m(s_z + ".pp512_card", "toks"), m(s_z + ".tg128_card", "toks")],
    ]
    vend = []
    for model in ["gpt-oss-20b-mxfp4", "gemma-4-26b-a4b-q4km", "gpt-oss-120b-mxfp4", "qwen3.5-122b-a10b-q4km"]:
        for be in ["HIP", "Vulkan"]:
            p = AI(model, be, "btrfs")
            vend.append([MODEL_NAMES[model], be, m(p + ".vendor.ours_tg128", "toks"), m(p + ".vendor.floor_tg128", "plain"),
                         m(p + ".vendor.ratio_tg", "x", "×")])
    oss, oss_vk = AI("gpt-oss-120b-mxfp4", "HIP", "btrfs"), AI("gpt-oss-120b-mxfp4", "Vulkan", "btrfs")
    return f"""
<section id="ai-box" class="story">
  <div class="wrap">
    <p class="kicker">Use case 1</p>
    <h2>Local AI and RAG box</h2>
    <p class="who">You want to run local LLMs, embeddings and a RAG index on the same box that stores the documents.</p>
    <div class="rec">
      <p class="rec-h">Recommended</p>
      <p class="rec-pick">ZFS RAIDZ1 across all five NVMe · models resident in memory · HIP for prefill and embeddings, Vulkan for chat</p>
      <ul>
        <li>{m(RZ1 + '.usable_tib', 'tib', 'TiB')} usable and {st(T(RZ1, SEQR), 'bw_gbps', 'gbps', 'GB/s')} cold sequential reads for model files and documents.</li>
        <li>Keeps {m(DG('zfs-raidz1') + '.ratios.' + SEQR + '.degraded_pct_of_healthy', 'pct', '%')} of its read speed with a drive out, so the index stays usable during a failure.</li>
        <li>Once a model is loaded, the pool makes no difference to inference speed (table below), so choose the pool for storage reasons.</li>
      </ul>
    </div>
    <div class="grid2">
      {c1}
      {c2}
    </div>
    <h3>What this means</h3>
    <ul class="take">
      <li><b>MoE models are the sweet spot.</b> gpt-oss-120b decodes at {m(oss + '.tg128_card', 'toks', 'tok/s')} (HIP) and {m(oss_vk + '.tg128_card', 'toks', 'tok/s')} (Vulkan). The dense 27B model manages {m(AI('qwen3.8-27b-ud-q4kxl', 'HIP', 'btrfs') + '.tg128_card', 'toks', 'tok/s')}.</li>
      <li><b>Pick the backend per job.</b> Vulkan decodes faster on all four models run on both backends. HIP prefills faster and loads much faster: gpt-oss-120b cold-loads in {m(oss + '.load.model_load_s', 's', 's')} on HIP against {m(oss_vk + '.load.model_load_s', 's', 's')} on Vulkan.</li>
      <li><b>Long context costs decode speed.</b> At 55k tokens gpt-oss-120b keeps {dv('pct_of', [oss + '.depth.tg128.d55000', oss + '.depth.tg128.d0'], '%')} of its empty-context decode speed.</li>
    </ul>
    <h3>Pool makes no difference once a model is resident</h3>
    {table(["Model", "Loaded from", "Cold load", "pp512 tok/s", "tg128 tok/s"], pool_rows)}
    <h3>All resident-model results</h3>
    {table(["Model", "Backend", "Cold load", "pp512 tok/s", "tg128 tok/s", "tg128 @ 55k"], rows)}
    <h3>Against the vendor's published figures</h3>
    {table(["Model", "Backend", "Ours tg128", "Minisforum reports", "Ours ÷ vendor"], vend)}
    <p class="note">Our figures here come from separate runs using the vendor's llama-bench invocation, so they differ slightly from the table above. Vendor figures are quoted from Minisforum's product page, which states no test conditions beyond all layers offloaded and flash attention on.</p>
    <h3>What the data does not support</h3>
    <ul class="gaps">
      <li>Vector-database or embedding-index IO patterns were not benchmarked. A small-recordsize dataset or zvol for the vector DB follows from the random-IO results, not from a direct test.</li>
      <li>KV-cache quantisation, prefill-under-decode scheduling and image or video generation have no published results.</li>
    </ul>
  </div>
</section>"""


def story_vm():
    zl = [("raid10", R10), ("raid10+spare", R10S), ("raidz1", RZ1), ("raidz2", RZ2)]
    labels = [LAYOUT_NAMES[k] for k, _ in zl]

    def pub(base, test, field):
        t = D.resolve(DATA, T(base, test))
        return T(base, test) + "." + field if t.get("publishable") else None

    c = chart("c-vm-iops", "bar", "Small-block IO on ZFS layouts (cold, IOPS)", labels,
              [series("Sync write 16K", [pub(b, SYNC, "iops") for _, b in zl], ORANGE),
               series("Random write 4K", [pub(b, R4W, "iops") for _, b in zl], TEAL),
               series("Mixed 70/30 16K", [pub(b, MIX, "iops") for _, b in zl], PURPLE)],
              "IOPS", "fio on zvols, primarycache=none. A missing bar is a PROVISIONAL figure (RAIDZ1 mixed 70/30), left out on purpose.",
              log=True)
    rows = []
    for k, b in zl:
        rows.append([LAYOUT_NAMES[k], m(b + ".usable_tib", "tib"), st(T(b, SYNC), "iops", "iops", claim=False),
                     st(T(b, R4W), "iops", "iops", claim=False), st(T(b, R16W), "iops", "iops", claim=False),
                     st(T(b, MIX), "iops", "iops", claim=False)])
    rz1m, r10m = ZM("stage2-raidz1-full"), ZM("stage1-raid10-full")
    return f"""
<section id="vm-server" class="story alt">
  <div class="wrap">
    <p class="kicker">Use case 2</p>
    <h2>AI + VM server (Proxmox)</h2>
    <p class="who">You want VMs and containers with databases alongside the AI workloads.</p>
    <div class="rec">
      <p class="rec-h">Recommended</p>
      <p class="rec-pick">ZFS RAID10 on the four Gen4 ×1 drives for VM disks (zvols) · keep <span class="mono">sync</span> enabled</p>
      <ul>
        <li>Sync 16K writes, which databases and VM guests depend on, run at {st(T(R10, SYNC), 'iops', 'iops', 'IOPS')} on RAID10 against {st(T(RZ1, SYNC), 'iops', 'iops', 'IOPS')} on RAIDZ1.</li>
        <li>Mixed 70/30 IO reaches {st(T(R10, MIX), 'iops', 'iops', 'IOPS')}. The cost is capacity: {m(R10 + '.usable_tib', 'tib', 'TiB')} usable.</li>
        <li>If capacity matters more than sync speed, one RAIDZ1 pool with VM zvols also works ({m(RZ1 + '.usable_tib', 'tib', 'TiB')}).</li>
      </ul>
    </div>
    {c}
    {table(["Layout", "TiB", "Sync 16K", "Rand write 4K", "Rand write 16K", "Mixed 70/30"], rows)}
    <h3>What this means</h3>
    <ul class="take">
      <li><b>The ×1 slots don't slow small-block IO much.</b> One drive at ×4 does sync writes {dv('ratio', [T(X4, SYNC) + '.iops', T(X1, SYNC) + '.iops'], '×')} as fast as at ×1, against {dv('ratio', [T(X4, SEQR) + '.bw_gbps', T(X1, SEQR) + '.bw_gbps'], '×')} for sequential reads. VM responsiveness is drive-bound, not lane-bound.</li>
      <li><b>ARC metadata caching helps reads, not sync.</b> With <span class="mono">primarycache=metadata</span>, 4K random reads on RAID10 rise to {st(T(r10m, R4R), 'iops', 'iops', 'IOPS')}, but RAIDZ1 sync writes fall to {st(T(rz1m, SYNC), 'iops', 'iops', 'IOPS')}.</li>
      <li><b>No power-loss protection.</b> The NM790 has none, so never set <span class="mono">sync=disabled</span> on VM storage.</li>
    </ul>
    <h3>What the data does not support</h3>
    <ul class="gaps">
      <li>A SLOG device on the ×4 slot was not tested, so there is no figure for RAIDZ1 + SLOG.</li>
      <li>The five 3.5″ SATA bays (shared Gen3 ×2 uplink) were not benchmarked. Using them as a backup pool is reasonable, but there is no data for it.</li>
      <li>Random IO can't be ranked across ZFS, btrfs and mdadm: ZFS ran on zvols and the others on files.</li>
      <li>Putting the OS on the ×4 drive alongside a RAID10 array is the intended layout, but the OS placement itself was not benchmarked.</li>
    </ul>
  </div>
</section>"""


def story_archive():
    arms = ["zfs-raidz1", "zfs-raidz2", "btrfs-raid10", "btrfs-raid5", "btrfs-raid6"]
    arm_label = {a["layout"]: a["arm"] for a in DATA["degraded_stage7"]}
    c = chart("c-degraded", "bar", "Read speed kept with one drive failed (% of healthy)",
              [arm_label[a] for a in arms],
              [series("Degraded seq read", [DG(a) + f".ratios.{SEQR}.degraded_pct_of_healthy" for a in arms], TEAL)],
              "%", "Stage 7: pool filled to 50 % with incompressible data, one member failed, sequential read 1M ×4 measured while degraded.",
              horizontal=True, max=100)
    c2 = chart("c-rebuild", "bar", "Time to rebuild onto a replacement drive (seconds)",
               [arm_label[a] for a in arms],
               [series("Rebuild wall time", [DG(a) + ".rebuild_wall_s" for a in arms], ORANGE)],
               "s", "ZFS resilvers only allocated blocks. 50 % fill, idle pool.", horizontal=True)
    rows = []
    for a, base in [("zfs-raidz1", RZ1), ("zfs-raidz2", RZ2), ("btrfs-raid5", BR5), ("btrfs-raid6", BR6)]:
        g = DG(a)
        rows.append([arm_label[a], m(base + ".usable_tib", "tib"), st(T(base, SEQR), "bw_gbps", "gbps"),
                     st(T(base, SEQW), "bw_gbps", "gbps"), m(g + f".ratios.{SEQR}.degraded_pct_of_healthy", "pct", "%"),
                     m(g + ".rebuild_wall_s", "s", "s"), m(f"{T(base, SEQW)}.w_amp", "x", "×")])
    usb = "usb_sto13b"
    soak = "soak[layout=raidz1&test_id=SOAK-02_mixed_70r30w_16k_j4]"
    c1 = DATA["degraded_controls"]
    ctl1 = f"degraded_controls[replicate={c1[0]['replicate']}].ratios.{SEQW}.s4_over_s1_pct"
    ctl2 = f"degraded_controls[replicate={c1[1]['replicate']}].ratios.{SEQW}.s4_over_s1_pct"
    return f"""
<section id="archive" class="story">
  <div class="wrap">
    <p class="kicker">Use case 3</p>
    <h2>Media and file archive</h2>
    <p class="who">You want bulk storage for media, backups and shared files that survives drive failures.</p>
    <div class="rec">
      <p class="rec-h">Recommended</p>
      <p class="rec-pick">ZFS RAIDZ2 5-wide for two-failure tolerance · ZFS RAIDZ1 if you need the extra capacity · scrub monthly</p>
      <ul>
        <li>RAIDZ2: {m(RZ2 + '.usable_tib', 'tib', 'TiB')}, {st(T(RZ2, SEQR), 'bw_gbps', 'gbps', 'GB/s')} cold reads, and {m(DG('zfs-raidz2') + '.ratios.' + SEQR + '.degraded_pct_of_healthy', 'pct', '%')} of read speed with a drive out.</li>
        <li>RAIDZ1: {m(RZ1 + '.usable_tib', 'tib', 'TiB')} and {m(DG('zfs-raidz1') + '.ratios.' + SEQR + '.degraded_pct_of_healthy', 'pct', '%')} degraded, rebuilt in {dv('minutes', [DG('zfs-raidz1') + '.rebuild_wall_s'], 'min')}.</li>
      </ul>
    </div>
    <div class="grid2">
      {c}
      {c2}
    </div>
    {table(["Layout", "TiB", "Seq read GB/s", "Seq write GB/s", "Degraded read", "Rebuild", "Write amp"], rows)}
    <p class="note">Don't compare the seq-write column across ZFS and btrfs: the ZFS cells fully preconditioned the drives first and the btrfs cells did not. Under the same stage-7 protocol, after the same 50&nbsp;% fill, RAIDZ1 wrote {m(DG('zfs-raidz1') + '.ratios.' + SEQW + '.S1_healthy_gbps', 'gbps', 'GB/s')} and btrfs raid5 {m(DG('btrfs-raid5') + '.ratios.' + SEQW + '.S1_healthy_gbps', 'gbps', 'GB/s')}.</p>
    <h3>What this means</h3>
    <ul class="take">
      <li><b>ZFS keeps serving when a drive dies; btrfs parity doesn't.</b> btrfs raid5 drops to {m(DG('btrfs-raid5') + '.ratios.' + SEQR + '.degraded_pct_of_healthy', 'pct', '%')} of its read speed with a drive out and takes {dv('minutes', [DG('btrfs-raid5') + '.rebuild_wall_s'], 'min')} to rebuild.</li>
      <li><b>Healthy reads are faster than 10GbE on every candidate.</b> A single client will be network-bound on reads. Network throughput itself was not measured.</li>
      <li><b>Big sustained writes slow down on these drives.</b> In a no-failure control the same write sequence returned {m(ctl1, 'pct', '%')} and {m(ctl2, 'pct', '%')} of its first sequential-write speed: the NM790 slows once its cache is spent. Plan large ingests with that in mind.</li>
      <li><b>Thermals are fine.</b> A one-hour mixed soak on RAIDZ1 held {m(soak + '.bw_gbps', 'gbps', 'GB/s')} steady with drives peaking at {m(soak + '.drive_temp_max_c', 'c', '°C')}.</li>
      <li><b>USB ingest.</b> Copying from a USB-attached NVMe into RAIDZ1 ran at {m(usb + '.read_mbps', 'mbps', 'MB/s')} and back out at {m(usb + '.write_mbps', 'mbps', 'MB/s')}. Post-campaign run on a different OS image; the enclosure fell back from UAS, so treat it as a floor.</li>
    </ul>
    <h3>What the data does not support</h3>
    <ul class="gaps">
      <li>SMB/NFS throughput over the 2×10GbE ports and the SATA bay tier were not measured.</li>
      <li>The btrfs raid5/6 write-hole (unclean shutdown) test was built but not run.</li>
    </ul>
  </div>
</section>"""


def story_big():
    rows = []
    for model in ["deepseek-v31-ud-q2kxl", "kimi-k2-thinking-smol-iq1kt"]:
        for pool, lbl in [("btrfs", "btrfs raid5 · cold"), ("zfs", "ZFS RAIDZ1 · ARC cold")]:
            p = AI(model, "HIP", pool)
            rows.append([MODEL_NAMES[model] if pool == "btrfs" else "", lbl, m(p + ".load.model_load_s", "s", "s"),
                         m(p + ".pp512_card", "toks"), m(p + ".tg128_card", "toks")])
    kb, kz = AI("kimi-k2-thinking-smol-iq1kt", "HIP", "btrfs"), AI("kimi-k2-thinking-smol-iq1kt", "HIP", "zfs")
    return f"""
<section id="big-models" class="story alt">
  <div class="wrap">
    <p class="kicker">Use case 4</p>
    <h2>Models larger than memory</h2>
    <p class="who">You want to run frontier-size models by streaming weights from the NVMe pool.</p>
    <div class="rec no">
      <p class="rec-h">No recommendation</p>
      <p class="rec-pick">The data does not support streaming models for interactive use on this box.</p>
      <ul>
        <li>Decode stays between {m(kb + '.tg128_card', 'toks', 'tok/s')} and {m(AI('deepseek-v31-ud-q2kxl', 'HIP', 'btrfs') + '.tg128_card', 'toks', 'tok/s')} on every pool tested.</li>
        <li>Load time is where pools differ: Kimi K2 loads in {m(kb + '.load.model_load_s', 's', 's')} from btrfs and {m(kz + '.load.model_load_s', 's', 's')} from ZFS with <span class="mono">primarycache=all</span>.</li>
      </ul>
    </div>
    {table(["Model", "Loaded from", "Cold load", "pp512 tok/s", "tg128 tok/s"], rows)}
    <h3>What the data does not support</h3>
    <ul class="gaps">
      <li>Streaming from a ZFS dataset with <span class="mono">primarycache=metadata</span> was not tested, so we can't say whether it closes the ZFS load gap.</li>
    </ul>
  </div>
</section>"""


def avoid():
    return f"""
<section id="avoid" class="band">
  <div class="wrap">
    <h2>Layouts to avoid, and why</h2>
    <div class="grid3">
      <article class="card warn"><h3>btrfs raid5/6 for primary data</h3>
        <p>Fastest when healthy ({st(T(BR5, SEQR), 'bw_gbps', 'gbps', 'GB/s')}), but degraded reads fall to {m(DG('btrfs-raid5') + '.ratios.' + SEQR + '.degraded_pct_of_healthy', 'pct', '%')} and raid6 takes {dv('minutes', [DG('btrfs-raid6') + '.rebuild_wall_s'], 'min')} to rebuild. The upstream data write hole is unmitigated (<span class="mono">-m raid1c3</span> protects metadata only) and was not tested here.</p></article>
      <article class="card warn"><h3>mdadm raid5/6 for VMs or databases</h3>
        <p>Fastest sequential writes ({st(T(MD5, SEQW), 'bw_gbps', 'gbps', 'GB/s')}), but 16K random writes collapse to {st(T(MD5, R16W), 'iops', 'iops', 'IOPS')} (raid5) and {st(T(MD6, R16W), 'iops', 'iops', 'IOPS')} (raid6). Fine for bulk sequential work only.</p></article>
      <article class="card warn"><h3>btrfs raid10 for single-stream reads</h3>
        <p>Reads only {st(T(BR10, SEQR), 'bw_gbps', 'gbps', 'GB/s')} cold, against {st(T(MD10, SEQR), 'bw_gbps', 'gbps', 'GB/s')} for mdadm raid10 on the same drives. The cause is not established.</p></article>
    </div>
  </div>
</section>"""


AXES = [
    ("capacity", "Capacity", None, "usable_tib", "TiB"),
    ("seqR", "Seq read 1M", SEQR, "bw_gbps", "GB/s"),
    ("seqW", "Seq write 1M", SEQW, "bw_gbps", "GB/s"),
    ("r4kR", "Rand read 4K", R4R, "iops", "IOPS"),
    ("r4kW", "Rand write 4K", R4W, "iops", "IOPS"),
    ("sync", "Sync write 16K", SYNC, "iops", "IOPS"),
]
REGIMES = [
    ("cold", "Cold (layout story)", [("zfs_stage12_cold", e) for e in DATA["zfs_stage12_cold"]] + [("fs_controls_cold", e) for e in DATA["fs_controls_cold"]]),
    ("metadata", "ZFS metadata ARC", [("zfs_stage12_metadata", e) for e in DATA["zfs_stage12_metadata"]]),
    ("warm", "Warm page cache (btrfs/mdadm)", [("fs_controls_warm", e) for e in DATA["fs_controls_warm"]]),
]


def explorer_data():
    out = {"axes": [{"key": k, "label": l, "unit": u} for k, l, _, _, u in AXES], "regimes": []}
    for rid, rlabel, recs in REGIMES:
        configs = []
        for sec, e in recs:
            base = f"{sec}[layout_full={e['layout_full']}]"
            vals, srcs, notes = {}, {}, {}
            for k, _, test, field, _ in AXES:
                if test is None:
                    path = f"{base}.{field}"
                    vals[k] = D.resolve(DATA, path)
                    srcs[k] = path
                    continue
                t = D.resolve(DATA, T(base, test))
                path = f"{T(base, test)}.{field}"
                if t.get("publishable"):
                    vals[k] = D.resolve(DATA, path)
                    srcs[k] = path
                else:
                    vals[k] = None
                    srcs[k] = path
                    notes[k] = "PROVISIONAL" if t.get("provisional") else "non-steady"
            configs.append({"id": f"{rid}:{e['layout_full']}", "label": LAYOUT_NAMES.get(e["layout"], e["layout"]),
                            "layout_full": e["layout_full"], "base": base, "values": vals, "src": srcs, "notes": notes})
        out["regimes"].append({"id": rid, "label": rlabel, "configs": configs})
    return out


def explorer():
    return """
<section id="explore" class="band">
  <div class="wrap">
    <h2>Compare tested layouts</h2>
    <p class="lede">Pick a cache regime and up to four layouts. Only configurations that were measured are listed, and every point is a sealed value; nothing on this chart can be edited.</p>
    <div class="ex" id="explorer">
      <fieldset class="ex-regime"><legend>Cache regime</legend><div id="ex-regimes"></div></fieldset>
      <fieldset class="ex-layouts"><legend>Layouts (max 4)</legend><div id="ex-configs"></div></fieldset>
      <div class="ex-chart"><canvas id="ex-radar" role="img" aria-label="Radar of the selected tested layouts"></canvas></div>
      <p class="cap" id="ex-cap">Each axis is scaled so 100 % is the best tested value in the selected regime. Hover a point for its measured value. A gap means that figure is non-steady or PROVISIONAL and is not plotted.</p>
      <div id="ex-table"></div>
      <p class="note">Compare random and sync IO within a stack only: ZFS ran on zvols, btrfs and mdadm on files. Sequential write also differs by drive state, because only the ZFS cells preconditioned the drives (see <a href="#archive">Media and file archive</a>). Warm figures measure the page cache, not the array.</p>
    </div>
  </div>
</section>"""


def lane_tax():
    return f"""
<section id="platform" class="band alt">
  <div class="wrap">
    <h2>The platform in one paragraph</h2>
    <p>Each of the four ×1 slots carries one drive at about {st(T(X1, SEQR), 'bw_gbps', 'gbps', 'GB/s')}; the ×4 slot reads {st(T(X4, SEQR), 'bw_gbps', 'gbps', 'GB/s')}. Striping across all five lifts sequential reads to {st(T(BR5, SEQR), 'bw_gbps', 'gbps', 'GB/s')} (btrfs raid5) and {st(T(MD5, SEQR), 'bw_gbps', 'gbps', 'GB/s')} (mdadm raid5), the fastest pools measured. Warm reads hit the memory ceiling (about {st(T(FW('stage5-btrfs-raid5-full'), SEQR), 'bw_gbps', 'gbps', 'GB/s')} on every layout) and say nothing about the array.</p>
  </div>
</section>"""


def storage_tables():
    cols = [("STO-01_seq_read_1M_j4", "bw_gbps", "gbps", "Seq R"), ("STO-01_seq_write_1M_j4", "bw_gbps", "gbps", "Seq W"),
            (R4R, "iops", "iops", "4K R"), (R4W, "iops", "iops", "4K W"), (R16W, "iops", "iops", "16K W"),
            (MIX, "iops", "iops", "Mixed"), (SYNC, "iops", "iops", "Sync 16K")]
    blocks = []
    for sec, title in [("zfs_stage12_cold", "ZFS · cold (primarycache=none)"), ("fs_controls_cold", "btrfs and mdadm · cold"),
                       ("zfs_stage12_metadata", "ZFS · primarycache=metadata"), ("fs_controls_warm", "btrfs and mdadm · warm (page cache)")]:
        rows = []
        for e in DATA[sec]:
            base = f"{sec}[layout_full={e['layout_full']}]"
            r = [LAYOUT_NAMES.get(e["layout"], e["layout"]), m(base + ".usable_tib", "tib")]
            for test, field, kind, _ in cols:
                r.append(st(T(base, test), field, kind, claim=False) if test in e["tests"] else "—")
            rows.append(r)
        blocks.append(f"<h3>{esc(title)}</h3>" + table(["Layout", "TiB"] + [f"{c[3]}<br><small>{'GB/s' if c[2] == 'gbps' else 'IOPS'}</small>" for c in cols], rows, "data dense"))
    return f"""
<section id="data" class="band">
  <div class="wrap">
    <h2>All storage results</h2>
    <details><summary>Show every published storage case (four tables)</summary>
    {''.join(blocks)}
    </details>
  </div>
</section>"""


def gaps_and_method():
    g = "".join(f"<tr><td>{esc(x['item'])}</td><td>{esc(x['status'])}</td></tr>" for x in DATA["not_yet_measured"])
    return f"""
<section id="limits" class="band alt">
  <div class="wrap">
    <h2>Not measured</h2>
    <div class="tbl"><table class="data"><thead><tr><th>Item</th><th>Status</th></tr></thead><tbody>{g}
      <tr><td>Image and video generation workloads</td><td>no published results</td></tr></tbody></table></div>
    <h2 id="method" class="spaced">Method, briefly</h2>
    <ul class="method">
      <li>Hardware: five Lexar NM790 4&nbsp;TB (DRAM-less, no power-loss protection), labelled SN1–SN5. SN1–SN4 on Gen4 ×1, SN5 on Gen4 ×4.</li>
      <li>Storage figures are fio Protocol B published cases: one sealed case per test, with a steadiness check. Non-steady and PROVISIONAL values are labelled and never used for a recommendation.</li>
      <li>Cold means <span class="mono">primarycache=none</span> on ZFS or dropped caches on btrfs/mdadm. Runs with a link-downtrained drive were excluded.</li>
      <li>AI figures are llama.cpp llama-bench (HIP/ROCm and Vulkan/RADV), f16 KV cache.</li>
      <li>Every number on this page is read from <a href="data/sealed-metrics.json">data/sealed-metrics.json</a>; hover a figure to see its source key.</li>
    </ul>
  </div>
</section>"""


def downloads():
    return """
<section id="downloads" class="band">
  <div class="wrap">
    <h2>Downloads and other views</h2>
    <ul class="dl">
      <li><a href="report/N5-MAX-final-report.pdf">Final report (PDF)</a>: the print edition with evidence tables.</li>
      <li><a href="report/">Final report (HTML print edition)</a></li>
      <li><a href="data/sealed-metrics.json">sealed-metrics.json</a>: every figure on this page.</li>
      <li><a href="matrix/">Campaign matrix</a>: run status and timestamps, not results.</li>
      <li><a href="telemetry-viz/">M.2 telemetry lab</a>: some views run on <b>DEMO</b> data.</li>
    </ul>
  </div>
</section>"""


def page():
    body = "".join([hero(), at_a_glance(), story_ai(), story_vm(), story_archive(), story_big(), avoid(),
                    lane_tax(), explorer(), storage_tables(), gaps_and_method(), downloads()])
    payload = {"charts": CHARTS, "explorer": explorer_data()}
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":")).replace("</", "<\\/")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>N5 MAX: what it's good for and how to set it up · measured results</title>
  <meta name="description" content="Minisforum N5 MAX benchmark results organised by use case: local AI and RAG, AI + VM server, media archive, and models larger than memory. Recommended configuration for each, from sealed measurements." />
  <!-- Generated by scripts/site/build.py from data/sealed-metrics.json. Do not edit by hand. -->
  <link rel="stylesheet" href="css/theme.css" />
  <link rel="stylesheet" href="css/results.css" />
  <script src="js/theme.js"></script>
  <script src="js/vendor/chart.umd.min.js" defer></script>
  <script src="js/results-charts.js" defer></script>
</head>
<body>
  <nav class="nav" aria-label="Sections">
    <div class="wrap nav-in">
      <a class="brand" href="#top">N5 MAX results</a>
      <div class="links">
        <a href="#verdict">Verdict</a>
        <a href="#ai-box">Local AI</a>
        <a href="#vm-server">AI + VMs</a>
        <a href="#archive">Archive</a>
        <a href="#big-models">Big models</a>
        <a href="#explore">Compare</a>
        <a href="#limits">Limits</a>
        <a href="#downloads">PDF &amp; data</a>
      </div>
      <div class="theme-toggle" data-theme-toggle role="group" aria-label="Color theme">
        <button type="button" data-theme-value="light">Light</button>
        <button type="button" data-theme-value="dark">Dark</button>
      </div>
    </div>
  </nav>
{body}
  <footer class="foot"><div class="wrap">Figures from sealed Protocol B published cases · final campaign data {esc(DATA['meta']['generated'])} · drive labels SN1–SN5 only</div></footer>
  <script type="application/json" id="n5-data">{blob}</script>
</body>
</html>
"""


def main():
    out = page()
    if "--check" in sys.argv:
        cur = open(OUT, encoding="utf-8").read()
        if cur != out:
            print("index.html is stale: run python3 scripts/site/build.py", file=sys.stderr)
            return 1
        print("index.html matches data/sealed-metrics.json")
        return 0
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(out)
    print(f"wrote {OUT} ({len(out)} bytes, {len(CHARTS)} charts)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
