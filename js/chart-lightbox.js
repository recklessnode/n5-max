/* Chart / graph lightbox for sealed index — snapshots canvases; enlarges SVG/PNG. */
(function () {
  const SELECTORS = [
    "figure.chart-card img",
    ".chart-panel canvas",
    "canvas#chart-radar",
    "canvas#chart-smallmultiples",
    "canvas#ix-radar",
  ].join(", ");

  let root = null;
  let titleEl = null;
  let imgEl = null;
  let closeBtn = null;
  let lastFocus = null;
  let open = false;

  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "chart-lightbox";
    root.className = "chart-lightbox";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-hidden", "true");
    root.hidden = true;
    root.innerHTML =
      '<div class="chart-lightbox-backdrop" data-lightbox-dismiss="1"></div>' +
      '<div class="chart-lightbox-panel">' +
      '<button type="button" class="chart-lightbox-close" aria-label="Close chart lightbox">&times;</button>' +
      '<p class="chart-lightbox-title" id="chart-lightbox-title"></p>' +
      '<div class="chart-lightbox-body"><img class="chart-lightbox-img" alt="" /></div>' +
      "</div>";
    document.body.appendChild(root);
    titleEl = root.querySelector(".chart-lightbox-title");
    imgEl = root.querySelector(".chart-lightbox-img");
    closeBtn = root.querySelector(".chart-lightbox-close");
    root.setAttribute("aria-labelledby", "chart-lightbox-title");

    root.addEventListener("click", function (e) {
      if (e.target && e.target.getAttribute("data-lightbox-dismiss") === "1") {
        closeLightbox();
      }
    });
    closeBtn.addEventListener("click", closeLightbox);
    return root;
  }

  function titleFor(el) {
    if (!el) return "Chart";
    if (el.tagName === "IMG") {
      const fig = el.closest("figure.chart-card");
      const cap = fig && fig.querySelector("figcaption");
      if (cap && cap.textContent.trim()) return cap.textContent.trim();
      if (el.alt && el.alt.trim()) return el.alt.trim();
      return "Chart";
    }
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    try {
      if (typeof Chart !== "undefined" && Chart.getChart) {
        const chart = Chart.getChart(el);
        const t = chart && chart.options && chart.options.plugins && chart.options.plugins.title;
        if (t && t.text) return String(t.text);
      }
    } catch (_) {
      /* ignore */
    }
    return "Interactive chart";
  }

  function snapshotCanvas(canvas) {
    try {
      if (typeof Chart !== "undefined" && Chart.getChart) {
        const chart = Chart.getChart(canvas);
        if (chart && typeof chart.toBase64Image === "function") {
          return chart.toBase64Image("image/png", 1);
        }
      }
    } catch (_) {
      /* fall through */
    }
    try {
      return canvas.toDataURL("image/png");
    } catch (_) {
      return "";
    }
  }

  function openLightbox(src, title, alt) {
    if (!src) return;
    ensureRoot();
    lastFocus = document.activeElement;
    titleEl.textContent = title || "Chart";
    imgEl.src = src;
    imgEl.alt = alt || title || "Enlarged chart";
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    root.classList.add("is-open");
    document.documentElement.classList.add("chart-lightbox-open");
    open = true;
    closeBtn.focus();
  }

  function closeLightbox() {
    if (!open || !root) return;
    open = false;
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    root.hidden = true;
    document.documentElement.classList.remove("chart-lightbox-open");
    imgEl.removeAttribute("src");
    imgEl.alt = "";
    titleEl.textContent = "";
    if (lastFocus && typeof lastFocus.focus === "function") {
      try {
        lastFocus.focus();
      } catch (_) {
        /* ignore */
      }
    }
    lastFocus = null;
  }

  function onTriggerClick(e) {
    const el = e.currentTarget;
    if (!el) return;
    e.preventDefault();
    const title = titleFor(el);
    if (el.tagName === "IMG") {
      openLightbox(el.currentSrc || el.src, title, el.alt || title);
      return;
    }
    if (el.tagName === "CANVAS") {
      const dataUrl = snapshotCanvas(el);
      if (!dataUrl) return;
      openLightbox(dataUrl, title, title);
    }
  }

  function onKeydown(e) {
    if (!open) return;
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      closeLightbox();
      return;
    }
    if (e.key === "Tab" && root) {
      const focusables = [closeBtn];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function markClickable(el) {
    if (!el || el.dataset.lightboxBound) return;
    el.dataset.lightboxBound = "1";
    el.classList.add("chart-lightbox-trigger");
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    if (!el.getAttribute("role") && el.tagName === "IMG") {
      el.setAttribute("role", "button");
    }
    const label = titleFor(el);
    if (el.tagName === "IMG" && !el.getAttribute("aria-label")) {
      el.setAttribute("aria-label", "Enlarge chart: " + label);
    } else if (el.tagName === "CANVAS") {
      const existing = el.getAttribute("aria-label") || label;
      if (!/enlarge/i.test(existing)) {
        el.setAttribute("aria-label", existing + " — click to enlarge");
      }
    }
    el.addEventListener("click", onTriggerClick);
    el.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        onTriggerClick(ev);
      }
    });
  }

  function bindAll() {
    document.querySelectorAll(SELECTORS).forEach(markClickable);
  }

  function main() {
    ensureRoot();
    bindAll();
    document.addEventListener("keydown", onKeydown);
    // Charts may render after async fetch; re-scan once shortly after.
    window.setTimeout(bindAll, 800);
    window.setTimeout(bindAll, 2500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
