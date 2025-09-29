// /public/dashboard.js
(function () {
  const auth = () => firebase.auth();
  const $ = (id) => document.getElementById(id);
  const fmtMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const TIMEZONE = "America/Los_Angeles";

  // ---------- LA day helpers ----------
  function laDateKey(d = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(d);
    const y = parts.find(p => p.type === "year").value;
    const m = parts.find(p => p.type === "month").value;
    const da = parts.find(p => p.type === "day").value;
    return `${y}-${m}-${da}`;
  }

  // ---------- Manual generate quota (client display only) ----------
  const QUOTA_KEY = () => `fb_manual_quota_${laDateKey()}`;
  function getLocalQuotaCount() {
    const raw = sessionStorage.getItem(QUOTA_KEY());
    return raw ? Math.max(0, Math.min(5, parseInt(raw, 10))) : 0;
  }
  function setLocalQuotaCount(n) {
    sessionStorage.setItem(QUOTA_KEY(), String(Math.max(0, Math.min(5, n))));
    renderGenCount();
  }
  function renderGenCount() {
    const el = $("genCount");
    if (el) el.textContent = `${getLocalQuotaCount()}/5`;
  }
  function setGenMsg(text, kind = "info") {
    const el = $("genMsg");
    if (!el) return;
    el.textContent = text || "";
    el.className =
      "text-sm mt-1 " +
      (kind === "ok"
        ? "text-green-600"
        : kind === "warn"
        ? "text-yellow-600"
        : kind === "err"
        ? "text-red-600"
        : "text-[var(--text-secondary)]");
  }

  // ---------- Timestamp parser ----------
  function parseTs(ts) {
    if (!ts) return null;
    if (typeof ts === "object") {
      if (typeof ts.toDate === "function") return ts.toDate();
      if ("_seconds" in ts && Number.isFinite(ts._seconds)) return new Date(ts._seconds * 1000);
      if ("seconds" in ts && Number.isFinite(ts.seconds)) return new Date(ts.seconds * 1000);
      if ("$date" in ts) return new Date(ts.$date);
    }
    if (typeof ts === "number" || typeof ts === "string") return new Date(ts);
    return null;
  }

  // ---------- Authed fetch ----------
  async function fetchWithAuth(path, options = {}) {
    const user = auth().currentUser;
    if (!user) throw new Error("Not signed in");
    const token = await user.getIdToken();
    const res = await fetch(path, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
    });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const payload = ct.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      const err = new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
      err.status = res.status;
      err.data = payload;
      throw err;
    }
    return payload;
  }

  // ---------- Account ----------
  async function loadAccount() {
    const data = await fetchWithAuth("/api/account");
    $("accountInfo").textContent =
      `Account: **** **** **** ${data.last4}  •  CVV: ${data.cvv}  •  Exp: ${data.expiry}`;
  }

  // ---------- Transactions & filters ----------
  let allTxns = [];
  let datePickerInstance = null;

  const dtLA = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
  });

  function renderTxns(list) {
    const tbody = $("transactionsTable");
    tbody.innerHTML = "";
    list.forEach((t) => {
      const d = parseTs(t.timestamp);
      const when = d ? dtLA.format(d) : "--";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="p-2 font-mono text-sm">${when}</td>
        <td class="p-2">${t.merchant ?? ""}</td>
        <td class="p-2"><span class="badge">${t.category ?? ""}</span></td>
        <td class="p-2 ${t.amount < 0 ? "amount-pos" : "amount-neg"}">${fmtMoney.format(t.amount)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function applyFilters() {
    const q = ($("searchBox").value || "").toLowerCase();
    const selected =
      datePickerInstance && datePickerInstance.selectedDates
        ? datePickerInstance.selectedDates[0]
        : null;

    let list = allTxns;

    if (selected) {
      const selectedKey = laDateKey(selected);
      list = list.filter((t) => {
        const d = parseTs(t.timestamp);
        return d && laDateKey(d) === selectedKey;
      });
    }

    if (q) {
      list = list.filter(
        (t) =>
          (t.merchant || "").toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q)
      );
    }

    renderTxns(list);
  }

  async function loadTxns() {
    const data = await fetchWithAuth("/api/transactions?limit=200");
    allTxns = data.items || [];
    applyFilters();
    updateTodayCount();
  }

  function updateTodayCount() {
    const todayLA = laDateKey(new Date());
    const count = allTxns.filter((t) => {
      const d = parseTs(t.timestamp);
      return d && laDateKey(d) === todayLA;
    }).length;
    $("todayCount").textContent = String(count);
  }

  // ---------- LA midnight countdown ----------
  function startLAClock() {
    const clockEl = $("laClock");
    const dateEl = $("laDate");
    const pad = (n) => n.toString().padStart(2, "0");

    function tick() {
      const now = new Date();
      const laNow = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }));
      const tomorrow = new Date(laNow);
      tomorrow.setDate(laNow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const diff = (tomorrow - laNow) / 1000;
      const hh = pad(Math.floor(diff / 3600));
      const mm = pad(Math.floor((diff % 3600) / 60));
      const ss = pad(Math.floor(diff % 60));
      clockEl.textContent = `${hh}:${mm}:${ss}`;

      const dOpts = { timeZone: TIMEZONE, weekday: "short", month: "short", day: "numeric" };
      dateEl.textContent = new Intl.DateTimeFormat("en-US", dOpts).format(laNow);
    }

    tick();
    setInterval(tick, 1000);
  }

  // ---------- Listeners ----------
  function setupListeners() {
    $("searchBox").addEventListener("input", applyFilters);
    $("refreshBtn").addEventListener("click", loadTxns);

    $("clearFiltersBtn")?.addEventListener("click", () => {
      $("searchBox").value = "";
      if (datePickerInstance) datePickerInstance.clear();
      applyFilters();
    });

    $("logoutBtn").addEventListener("click", async () => {
      await auth().signOut();
      location.href = "index.html";
    });

    $("generateBtn").addEventListener("click", async (evt) => {
      const btn = evt.currentTarget;
      if (getLocalQuotaCount() >= 5) {
        setGenMsg("Daily manual limit reached. Try again after LA midnight.", "warn");
        return;
      }
      if (btn.disabled) return;

      setGenMsg("Generating…");
      btn.disabled = true;

      try {
        const out = await fetchWithAuth("/tick");
        const remaining = Math.max(0, out.remaining ?? 0);
        const used = 5 - remaining;
        setLocalQuotaCount(used);
        setGenMsg(`Generated 1 transaction. ${remaining} remaining today.`, "ok");
        setTimeout(loadTxns, 600);
      } catch (e) {
        if (e.status === 429 && e.data && e.data.error === "daily_limit_reached") {
          setLocalQuotaCount(5);
          setGenMsg("Daily manual limit reached. Try again after LA midnight.", "warn");
        } else if (e.status === 401) {
          setGenMsg("Session expired. Please sign in again.", "err");
        } else {
          console.error(e);
          setGenMsg("Failed to generate. Please try again.", "err");
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------- Entry ----------
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      location.href = "index.html";
      return;
    }

    // Flatpickr date picker: read-only; icon opens it; no native mobile picker
    if (window.flatpickr) {
      datePickerInstance = flatpickr("#datePicker", {
        allowInput: false,      // block typing
        clickOpens: true,       // clicking the input opens
        disableMobile: true,    // force flatpickr UI on mobile
        dateFormat: "Y-m-d",
        onChange: applyFilters
      });

      const input = $("#datePicker");
      if (input) {
        input.setAttribute("readonly", "readonly");     // prevent keyboard
        input.setAttribute("inputmode", "none");        // mobile keyboards
        input.addEventListener("keydown", (e) => e.preventDefault());
      }

      // Clicking the calendar icon opens the picker
      $("#datePickerBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        datePickerInstance?.open();
      });
    }

    startLAClock();
    setupListeners();
    renderGenCount();

    try {
      await loadAccount();
      await loadTxns();
    } catch (e) {
      console.error("Initialization error:", e);
      setGenMsg("Failed to load data.", "err");
    }
  });
})();
