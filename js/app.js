/* N5 MAX storage benchmark — charts + interactions */
(function () {
  "use strict";

  const RAID10 = "#E86A2B";
  const RAIDZ1 = "#1FA6A0";
  const RAID10_SOFT = "rgba(232, 106, 43, 0.85)";
  const RAIDZ1_SOFT = "rgba(31, 166, 160, 0.85)";
  const GRID = "rgba(26, 25, 23, 0.06)";
  const TICK = "#6b665e";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  Chart.defaults.font.family = '"Instrument Sans", ui-sans-serif, system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = TICK;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.animation = reduceMotion ? false : { duration: 900, easing: "easeOutQuart" };

  const monoTick = {
    font: { family: '"JetBrains Mono", ui-monospace, monospace', size: 11, weight: "500" },
    color: TICK,
  };

  function barOpts(yTitle, stacked) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          stacked: !!stacked,
          grid: { display: false },
          ticks: { ...monoTick, maxRotation: 0 },
          border: { color: GRID },
        },
        y: {
          stacked: !!stacked,
          beginAtZero: true,
          grid: { color: GRID },
          border: { display: false },
          ticks: monoTick,
          title: {
            display: !!yTitle,
            text: yTitle,
            color: TICK,
            font: { family: '"Instrument Sans", sans-serif', size: 11, weight: "500" },
          },
        },
      },
      plugins: {
        tooltip: {
          backgroundColor: "#1a1917",
          titleFont: { family: '"Instrument Sans", sans-serif', weight: "600" },
          bodyFont: { family: '"JetBrains Mono", monospace', size: 12 },
          padding: 10,
          cornerRadius: 8,
          displayColors: true,
          boxPadding: 4,
        },
      },
    };
  }

  /* Sequential throughput */
  new Chart(document.getElementById("chart-seq"), {
    type: "bar",
    data: {
      labels: ["read 1M ×4", "write 1M ×4"],
      datasets: [
        {
          label: "RAID10",
          data: [5.58, 0.63],
          backgroundColor: RAID10_SOFT,
          borderColor: RAID10,
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.72,
          categoryPercentage: 0.65,
        },
        {
          label: "RAIDZ1",
          data: [6.02, 0.73],
          backgroundColor: RAIDZ1_SOFT,
          borderColor: RAIDZ1,
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.72,
          categoryPercentage: 0.65,
        },
      ],
    },
    options: barOpts("Sequential throughput GB/s"),
  });

  /* Random IOPS */
  new Chart(document.getElementById("chart-iops"), {
    type: "bar",
    data: {
      labels: ["4K rd", "4K wr", "16K rd", "16K wr", "64K rd", "64K wr"],
      datasets: [
        {
          label: "RAID10",
          data: [123.1, 39.0, 68.9, 28.6, 41.7, 8.5],
          backgroundColor: RAID10_SOFT,
          borderRadius: 5,
          borderSkipped: false,
          barPercentage: 0.75,
          categoryPercentage: 0.7,
        },
        {
          label: "RAIDZ1",
          data: [78.8, 21.3, 35.0, 36.0, 16.2, 8.9],
          backgroundColor: RAIDZ1_SOFT,
          borderRadius: 5,
          borderSkipped: false,
          barPercentage: 0.75,
          categoryPercentage: 0.7,
        },
      ],
    },
    options: barOpts("Random IOPS thousands"),
  });

  /* Compression grouped by algorithm per payload — grouped bars with 3 datasets (payloads) × 4 categories (algos)
     Or: grouped by payload with 4 algo bars. Artifact shows payloads as groups, algorithms as series. */
  const algos = ["off", "lz4", "zstd-fast", "zstd-3"];
  const compressionColors = {
    off: "rgba(154, 148, 138, 0.75)",
    lz4: "rgba(31, 166, 160, 0.75)",
    "zstd-fast": "rgba(31, 166, 160, 0.55)",
    "zstd-3": "rgba(232, 106, 43, 0.7)",
  };

  new Chart(document.getElementById("chart-compression"), {
    type: "bar",
    data: {
      labels: ["Bluray (incompressible)", "raw VM disk", "qcow2 (mixed)"],
      datasets: algos.map((algo, i) => ({
        label: algo,
        data: [
          [1.0, 1.0, 1.0, 1.0][i],
          [1.0, 1.47, 1.51, 1.76][i],
          [1.0, 1.8, 1.93, 1.99][i],
        ],
        backgroundColor: compressionColors[algo],
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.85,
        categoryPercentage: 0.75,
      })),
    },
    options: {
      ...barOpts("logical ÷ physical · higher saves more"),
      plugins: {
        ...barOpts().plugins,
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            borderRadius: 3,
            useBorderRadius: true,
            font: { family: '"JetBrains Mono", monospace', size: 11 },
            color: TICK,
            padding: 14,
          },
        },
      },
    },
  });

  /* Amplification bars (CSS-driven; animate widths) */
  const ampMax = 2.2;
  document.querySelectorAll("[data-amp]").forEach((el) => {
    const v = parseFloat(el.getAttribute("data-amp"));
    const pct = Math.min(100, (v / ampMax) * 100);
    requestAnimationFrame(() => {
      el.style.width = pct + "%";
    });
  });

  /* Sticky nav active section */
  const navLinks = document.querySelectorAll(".nav-links a");
  const sections = [...navLinks]
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  function setActiveNav() {
    const y = window.scrollY + 90;
    let current = sections[0];
    for (const s of sections) {
      if (s.offsetTop <= y) current = s;
    }
    navLinks.forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === "#" + current.id);
    });
  }

  window.addEventListener("scroll", setActiveNav, { passive: true });
  setActiveNav();

  /* Reveal on scroll */
  const reveals = document.querySelectorAll(".reveal");
  if (reduceMotion) {
    reveals.forEach((el) => el.classList.add("in"));
  } else if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  /* Simple photo / diagram lightbox */
  const lb = document.getElementById("lightbox");
  if (lb) {
    const lbImg = lb.querySelector("img");
    const lbCap = lb.querySelector(".lightbox-caption");
    const closeLb = () => {
      lb.hidden = true;
      lbImg.src = "";
      document.body.style.overflow = "";
    };
    document.querySelectorAll("[data-lightbox]").forEach((fig) => {
      fig.addEventListener("click", () => {
        const img = fig.querySelector("img");
        const cap = fig.querySelector("figcaption");
        if (!img) return;
        lbImg.src = img.currentSrc || img.src;
        lbImg.alt = img.alt || "";
        lbCap.textContent = cap ? cap.textContent : "";
        lb.hidden = false;
        document.body.style.overflow = "hidden";
      });
    });
    lb.querySelector(".lightbox-close").addEventListener("click", closeLb);
    lb.addEventListener("click", (e) => {
      if (e.target === lb) closeLb();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !lb.hidden) closeLb();
    });
  }

})();
