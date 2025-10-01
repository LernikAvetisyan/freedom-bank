// /public/dashboard.js
(function () {
  const auth = () => firebase.auth();
  const $ = (id) => document.getElementById(id);
  const fmtMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const TIMEZONE = "America/Los_Angeles";
  const ACCOUNT_TYPES = ["checking", "credit"];
  let currentAccount = "checking"; // default
  let allTxns = [];
  let datePickerInstance = null;

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

  // ---------- Manual generate quota (client display only, per-account) ----------
  const QUOTA_KEY = (acct = currentAccount) => `fb_manual_quota_${acct}_${laDateKey()}`;
  function getLocalQuotaCount(acct = currentAccount) {
    const raw = sessionStorage.getItem(QUOTA_KEY(acct));
    return raw ? Math.max(0, Math.min(5, parseInt(raw, 10))) : 0;
  }
  function setLocalQuotaCount(n, acct = currentAccount) {
    sessionStorage.setItem(QUOTA_KEY(acct), String(Math.max(0, Math.min(5, n))));
    renderGenCount(acct);
  }
  function renderGenCount(acct = currentAccount) {
    const el = $("genCount");
    if (el) el.textContent = `${getLocalQuotaCount(acct)}/5`;
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
  async function loadAccount(acct = currentAccount) {
    const data = await fetchWithAuth(`/api/account?account=${encodeURIComponent(acct)}`);
    $("accountTitle").textContent =
      acct === "credit" ? "Credit Card" : "Checking Account";
    $("accountInfo").textContent =
      `Account: **** **** **** ${data.last4}  •  CVV: ${data.cvv}  •  Exp: ${data.expiry}`;
  }

  // ---------- Transactions & filters ----------
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
      const isManual = String(t.source || "").trim().toLowerCase() === "manual";

      const tr = document.createElement("tr");
      tr.className = isManual ? "row-manual" : "";
      tr.innerHTML = `
        <td class="p-2 font-mono text-sm">${when}</td>
        <td class="p-2">
          ${t.merchant ?? ""}
          ${isManual ? '<span class="manual-badge">Manual</span>' : ''}
        </td>
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

  async function loadTxns(acct = currentAccount) {
    const data = await fetchWithAuth(`/api/transactions?limit=200&account=${encodeURIComponent(acct)}`);
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

  // ---------- Switch UI ----------
  function setActiveSwitch(acct) {
    const btnChecking = $("btnChecking");
    const btnCredit   = $("btnCredit");
    btnChecking.classList.toggle("active", acct === "checking");
    btnCredit.classList.toggle("active",   acct === "credit");
    btnChecking.setAttribute("aria-selected", String(acct === "checking"));
    btnCredit.setAttribute("aria-selected",   String(acct === "credit"));
  }

  async function switchAccount(acct) {
    const normalized = ACCOUNT_TYPES.includes(String(acct).toLowerCase()) ? String(acct).toLowerCase() : "checking";
    if (normalized === currentAccount) return;

    currentAccount = normalized;
    setActiveSwitch(currentAccount);
    renderGenCount(currentAccount);
    setGenMsg(""); // clear

    try {
      await loadAccount(currentAccount);
      await loadTxns(currentAccount);
    } catch (e) {
      console.error("Switch account error:", e);
      setGenMsg("Failed to switch account.", "err");
    }
  }

  // ---------- Listeners ----------
  function setupListeners() {
    $("searchBox").addEventListener("input", applyFilters);
    $("refreshBtn").addEventListener("click", () => loadTxns(currentAccount));

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
      if (getLocalQuotaCount(currentAccount) >= 5) {
        setGenMsg("Daily manual limit reached for this account. Try again after LA midnight.", "warn");
        return;
      }
      if (btn.disabled) return;

      setGenMsg("Generating…");
      btn.disabled = true;

      try {
        const out = await fetchWithAuth(`/tick?account=${encodeURIComponent(currentAccount)}`);
        const remaining = Math.max(0, out.remaining ?? 0);
        const used = 5 - remaining;
        setLocalQuotaCount(used, currentAccount);
        setGenMsg(`Generated 1 transaction. ${remaining} remaining today for ${currentAccount}.`, "ok");
        setTimeout(() => loadTxns(currentAccount), 600);
      } catch (e) {
        if (e.status === 429 && e.data && e.data.error === "daily_limit_reached") {
          setLocalQuotaCount(5, currentAccount);
          setGenMsg("Daily manual limit reached for this account. Try again after LA midnight.", "warn");
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

    $("btnChecking").addEventListener("click", () => switchAccount("checking"));
    $("btnCredit").addEventListener("click",   () => switchAccount("credit"));
  }

  // ---------- Entry ----------
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      location.href = "index.html";
      return;
    }

    // Flatpickr date picker
    if (window.flatpickr) {
      datePickerInstance = flatpickr("#datePicker", {
        allowInput: false,
        clickOpens: true,
        disableMobile: true,
        dateFormat: "Y-m-d",
        onChange: applyFilters
      });

      const input = $("#datePicker");
      if (input) {
        input.setAttribute("readonly", "readonly");
        input.setAttribute("inputmode", "none");
        input.addEventListener("keydown", (e) => e.preventDefault());
      }

      $("#datePickerBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        datePickerInstance?.open();
      });
    }

    startLAClock();
    setupListeners();
    setActiveSwitch(currentAccount);
    renderGenCount(currentAccount);

    // Reset per-account visual counters and today count at LA midnight
    let lastQuotaKeyChecking = `fb_manual_quota_checking_${laDateKey()}`;
    let lastQuotaKeyCredit   = `fb_manual_quota_credit_${laDateKey()}`;
    setInterval(() => {
      const nowKeyChecking = `fb_manual_quota_checking_${laDateKey()}`;
      const nowKeyCredit   = `fb_manual_quota_credit_${laDateKey()}`;
      if (nowKeyChecking !== lastQuotaKeyChecking || nowKeyCredit !== lastQuotaKeyCredit) {
        lastQuotaKeyChecking = nowKeyChecking;
        lastQuotaKeyCredit   = nowKeyCredit;
        renderGenCount(currentAccount);
        updateTodayCount();
      }
    }, 30 * 1000);

    try {
      await loadAccount(currentAccount);
      await loadTxns(currentAccount);
    } catch (e) {
      console.error("Initialization error:", e);
      setGenMsg("Failed to load data.", "err");
    }
  });
})();
