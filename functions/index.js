/* eslint-disable no-console */
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Firebase Functions v2
const { onRequest }  = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');

admin.initializeApp();
const db   = getFirestore();
const auth = admin.auth();

/* ---------- Config (all defaults are safe) ---------- */
const MIN_TXNS   = parseInt(process.env.MIN_TXNS   || '3', 10);  // random generator per LA day (lower bound)
const MAX_TXNS   = parseInt(process.env.MAX_TXNS   || '5', 10);  // random generator per LA day (upper bound)
const MANUAL_CAP = parseInt(process.env.MANUAL_CAP || '5', 10);  // "Generate" button daily cap per LA day
const TIMEZONE   = process.env.TIMEZONE || 'America/Los_Angeles';
const ACCOUNT_TYPES = ['checking', 'credit'];                    // NEW: supported accounts

/* ---------- Transaction pool (UNCHANGED) ---------- */
const TRANSACTION_POOL = {
  Groceries: [
    { merchant: "Trader Joe's", min: 25, max: 150 },
    { merchant: 'Whole Foods Market', min: 40, max: 250 },
    { merchant: 'Costco', min: 100, max: 500 },
    { merchant: 'Safeway', min: 20, max: 180 },
    { merchant: 'Kroger', min: 20, max: 180 },
    { merchant: 'Albertsons', min: 20, max: 180 },
    { merchant: 'Aldi', min: 15, max: 120 },
    { merchant: 'Lidl', min: 15, max: 120 },
    { merchant: 'Walmart Grocery', min: 20, max: 220 },
    { merchant: 'Target Grocery', min: 20, max: 180 },
    { merchant: 'H-E-B', min: 20, max: 180 },
    { merchant: 'Meijer', min: 20, max: 180 },
    { merchant: 'Publix', min: 25, max: 190 },
    { merchant: 'Ralphs', min: 20, max: 180 },
    { merchant: 'Vons', min: 20, max: 170 },
    { merchant: 'Food Lion', min: 15, max: 150 },
    { merchant: 'Giant Food', min: 20, max: 180 },
    { merchant: 'Wegmans', min: 30, max: 220 },
    { merchant: 'Sprouts Farmers Market', min: 20, max: 160 },
    { merchant: 'Fresh Thyme', min: 15, max: 140 },
  ],
  'Food & Dining': [
    { merchant: 'Starbucks', min: 5, max: 30 },
    { merchant: "McDonald's", min: 8, max: 40 },
    { merchant: 'Chipotle', min: 12, max: 50 },
    { merchant: 'Subway', min: 8, max: 35 },
    { merchant: 'Chick-fil-A', min: 9, max: 40 },
    { merchant: 'Burger King', min: 8, max: 35 },
    { merchant: 'Taco Bell', min: 7, max: 30 },
    { merchant: 'KFC', min: 9, max: 35 },
    { merchant: 'Panda Express', min: 10, max: 45 },
    { merchant: 'Panera Bread', min: 10, max: 45 },
    { merchant: 'Dunkin', min: 4, max: 25 },
    { merchant: 'Five Guys', min: 12, max: 55 },
    { merchant: 'Shake Shack', min: 12, max: 60 },
    { merchant: 'Domino’s', min: 10, max: 45 },
    { merchant: 'Papa Johns', min: 10, max: 45 },
    { merchant: 'Pizza Hut', min: 10, max: 45 },
    { merchant: 'Olive Garden', min: 15, max: 80 },
    { merchant: 'The Cheesecake Factory', min: 20, max: 120 },
    { merchant: 'Buffalo Wild Wings', min: 15, max: 90 },
    { merchant: 'Local Cafe', min: 6, max: 35 },
  ],
  Transportation: [
    { merchant: 'Uber', min: 10, max: 75 },
    { merchant: 'Lyft', min: 10, max: 75 },
    { merchant: 'Shell Gas Station', min: 30, max: 80 },
    { merchant: 'Chevron', min: 30, max: 80 },
    { merchant: 'Exxon', min: 30, max: 80 },
    { merchant: 'BP', min: 30, max: 80 },
    { merchant: 'Mobil', min: 30, max: 80 },
    { merchant: '7-Eleven Fuel', min: 25, max: 70 },
    { merchant: 'Costco Fuel', min: 25, max: 70 },
    { merchant: 'Arco', min: 25, max: 70 },
    { merchant: 'Public Transit', min: 2, max: 12 },
    { merchant: 'Metro Card Reload', min: 5, max: 50 },
    { merchant: 'Parking Garage', min: 5, max: 40 },
    { merchant: 'Toll Road', min: 3, max: 20 },
    { merchant: 'Car Wash', min: 8, max: 35 },
    { merchant: 'Jiffy Lube', min: 40, max: 150 },
    { merchant: 'AutoZone', min: 10, max: 120 },
    { merchant: 'Advance Auto Parts', min: 10, max: 120 },
    { merchant: 'Enterprise Rent-A-Car', min: 40, max: 200 },
    { merchant: 'Hertz', min: 40, max: 220 },
  ],
  Subscriptions: [
    { merchant: 'Netflix', min: 10, max: 25 },
    { merchant: 'Spotify', min: 10, max: 18 },
    { merchant: 'YouTube Premium', min: 10, max: 20 },
    { merchant: 'Hulu', min: 8, max: 20 },
    { merchant: 'Disney+', min: 8, max: 20 },
    { merchant: 'Max', min: 10, max: 20 },
    { merchant: 'Paramount+', min: 8, max: 18 },
    { merchant: 'Peacock', min: 6, max: 16 },
    { merchant: 'Apple Music', min: 10, max: 18 },
    { merchant: 'Apple iCloud', min: 1, max: 10 },
    { merchant: 'Amazon Prime', min: 10, max: 18 },
    { merchant: 'Audible', min: 8, max: 18 },
    { merchant: 'Adobe Creative Cloud', min: 10, max: 60 },
    { merchant: 'Canva Pro', min: 8, max: 20 },
    { merchant: 'Notion', min: 4, max: 15 },
    { merchant: 'Evernote', min: 4, max: 15 },
    { merchant: 'Dropbox', min: 8, max: 25 },
    { merchant: 'Google One', min: 2, max: 20 },
    { merchant: 'Microsoft 365', min: 8, max: 25 },
    { merchant: 'GitHub', min: 4, max: 10 },
  ],
  Utilities: [
    { merchant: 'Electric Utility', min: 40, max: 220 },
    { merchant: 'Gas Utility', min: 20, max: 140 },
    { merchant: 'Water Utility', min: 20, max: 120 },
    { merchant: 'Trash Service', min: 15, max: 60 },
    { merchant: 'Sewer Service', min: 15, max: 80 },
    { merchant: 'Internet Provider', min: 40, max: 120 },
    { merchant: 'Mobile Phone Carrier', min: 30, max: 120 },
    { merchant: 'Home Phone', min: 10, max: 40 },
    { merchant: 'Cable TV', min: 30, max: 120 },
    { merchant: 'Solar Service', min: 20, max: 150 },
    { merchant: 'Home Security', min: 15, max: 70 },
    { merchant: 'Streaming Bundle', min: 15, max: 40 },
    { merchant: 'Cloud Storage', min: 2, max: 20 },
    { merchant: 'VPN Service', min: 3, max: 15 },
    { merchant: 'Domain Renewal', min: 10, max: 40 },
    { merchant: 'Web Hosting', min: 5, max: 25 },
    { merchant: 'Electric Vehicle Charging', min: 5, max: 40 },
    { merchant: 'Propane Refill', min: 10, max: 50 },
    { merchant: 'Smart Home Service', min: 5, max: 25 },
    { merchant: 'Device Protection Plan', min: 5, max: 20 },
  ],
  Entertainment: [
    { merchant: 'AMC Theatres', min: 12, max: 60 },
    { merchant: 'Regal Cinemas', min: 12, max: 60 },
    { merchant: 'IMAX', min: 15, max: 80 },
    { merchant: 'Fandango', min: 10, max: 60 },
    { merchant: 'Concert Tickets', min: 25, max: 200 },
    { merchant: 'Live Nation', min: 25, max: 250 },
    { merchant: 'Bowling Alley', min: 10, max: 70 },
    { merchant: 'Mini Golf', min: 8, max: 40 },
    { merchant: 'Arcade', min: 5, max: 50 },
    { merchant: 'Escape Room', min: 20, max: 150 },
    { merchant: 'Museum', min: 10, max: 50 },
    { merchant: 'Zoo', min: 10, max: 70 },
    { merchant: 'Theme Park', min: 50, max: 250 },
    { merchant: 'Sporting Event', min: 25, max: 300 },
    { merchant: 'Karaoke', min: 15, max: 90 },
    { merchant: 'Theatre Playhouse', min: 20, max: 200 },
    { merchant: 'Comedy Club', min: 15, max: 120 },
    { merchant: 'Bookstore', min: 8, max: 120 },
    { merchant: 'Vinyl Record Shop', min: 10, max: 120 },
    { merchant: 'Game Store', min: 10, max: 120 },
  ],
  Shopping: [
    { merchant: 'Amazon', min: 5, max: 400 },
    { merchant: 'Target', min: 10, max: 300 },
    { merchant: 'Walmart', min: 10, max: 300 },
    { merchant: 'Best Buy', min: 10, max: 800 },
    { merchant: 'IKEA', min: 20, max: 600 },
    { merchant: 'Home Depot', min: 10, max: 700 },
    { merchant: 'Lowe’s', min: 10, max: 700 },
    { merchant: 'Macy’s', min: 10, max: 400 },
    { merchant: 'Nordstrom', min: 20, max: 800 },
    { merchant: 'Sephora', min: 10, max: 300 },
    { merchant: 'Ulta Beauty', min: 10, max: 300 },
    { merchant: 'Nike', min: 10, max: 400 },
    { merchant: 'Adidas', min: 10, max: 400 },
    { merchant: 'H&M', min: 10, max: 300 },
    { merchant: 'Zara', min: 10, max: 300 },
    { merchant: 'Apple Store', min: 20, max: 1500 },
    { merchant: 'Google Store', min: 20, max: 1200 },
    { merchant: 'Etsy', min: 5, max: 250 },
    { merchant: 'eBay', min: 5, max: 500 },
    { merchant: 'Cost Plus World Market', min: 10, max: 250 },
  ],
};
const CATEGORIES = Object.keys(TRANSACTION_POOL);

/* ---------- Helpers (LA day) ---------- */
function laDateKey(d = new Date(), tz = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const y  = parts.find(p => p.type === 'year').value;
  const m  = parts.find(p => p.type === 'month').value;
  const da = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${da}`; // YYYY-MM-DD in LA time
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
function randomDigits(n) { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10); return s; }
function makeCVV() { return ('000' + Math.floor(Math.random() * 1000)).slice(-3); }
function makeExpiry() {
  const now = new Date();
  const yearsOut = 2 + Math.floor(Math.random() * 4);
  const expDate = new Date(now.getFullYear() + yearsOut, Math.floor(Math.random() * 12), 1);
  const mm = ('0' + (expDate.getMonth() + 1)).slice(-2);
  const yy = String(expDate.getFullYear()).slice(2);
  return `${mm}/${yy}`;
}
function randomAmount(info) {
  const v = Math.random() * (info.max - info.min) + info.min;
  const sign = Math.random() < 0.12 ? -1 : 1; // refunds sometimes
  return Number((sign * v).toFixed(2));
}

/* ---------- Account helpers (NEW) ---------- */
function normalizeAccount(acctRaw) {
  const a = String(acctRaw || '').toLowerCase();
  if (ACCOUNT_TYPES.includes(a)) return a;
  if (a === 'main') return 'checking'; // backward friendly
  return 'checking';
}
function getAccountRef(uid, acctRaw) {
  const acct = normalizeAccount(acctRaw);
  return db.collection('users').doc(uid).collection('account').doc(acct);
}
async function ensureAccount(accountRef) {
  const snap = await accountRef.get();
  if (!snap.exists) {
    await accountRef.set({
      accountNumber: randomDigits(16),
      cvv: makeCVV(),
      expiry: makeExpiry(),
      createdAt: FieldValue.serverTimestamp(),
    });
    return accountRef.get();
  }
  return snap;
}

/* ---------- Transaction creation ---------- */
// ---------- Transaction creation (manual = now, auto = random last hour) ----------
async function makeTransaction(accountRef, source = 'auto') {
  const cat  = pick(CATEGORIES);
  const info = pick(TRANSACTION_POOL[cat]);
  const amount = randomAmount(info);

  const now = new Date();

  // Manual clicks use the current time (optional tiny jitter to avoid identical seconds if you double-click)
  // Autos keep a random timestamp within the last hour so they look organic.
  const jitterMinutes = source === 'manual' ? 0 : Math.floor(Math.random() * 60);
  const jitterSeconds = source === 'manual' ? Math.floor(Math.random() * 3) : Math.floor(Math.random() * 60);

  const ts = new Date(now.getTime() - (jitterMinutes * 60 + jitterSeconds) * 1000);

  const txn = {
    id: `sim_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    merchant: info.merchant,
    category: cat,
    amount,
    type: amount < 0 ? 'refund' : 'expense',
    source,                 // 'manual' or 'auto'
    date: laDateKey(ts),    // LA-day key
    timestamp: ts,          // actual moment
  };

  await accountRef.collection('transactions').doc(txn.id).set(txn);
  return txn;
}


/* ---------- Random generator (3–5 per LA day) ---------- */
async function getDailyTarget(accountRef, dateStr) {
  const dtRef = accountRef.collection('dailyTargets').doc(dateStr);
  const snap = await dtRef.get();
  if (!snap.exists) {
    const target = Math.floor(Math.random() * (MAX_TXNS - MIN_TXNS + 1)) + MIN_TXNS;
    await dtRef.set({ target, generated: 0, createdAt: FieldValue.serverTimestamp() });
    return { ref: dtRef, target, generated: 0 };
  }
  const data = snap.data();
  return { ref: dtRef, target: data.target, generated: data.generated || 0 };
}

async function maybeGenerate(accountRef) {
  const dateStr = laDateKey();  // LA day
  const { ref: dtRef, target, generated } = await getDailyTarget(accountRef, dateStr);
  if (generated >= target) return null;
  const txn = await makeTransaction(accountRef, 'auto');  // scheduled -> auto
  await dtRef.update({ generated: FieldValue.increment(1) });
  return txn;
}

/* ---------- Manual daily cap (5 per LA day) ---------- */
async function getManualCounter(accountRef, dateStr) {
  const ref = accountRef.collection('manualDaily').doc(dateStr);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ used: 0, cap: MANUAL_CAP, createdAt: FieldValue.serverTimestamp() });
    return { ref, used: 0, cap: MANUAL_CAP };
  }
  const d = snap.data();
  return { ref, used: d.used || 0, cap: d.cap || MANUAL_CAP };
}

/* ---------- Per-user tick (NOW runs for both accounts) ---------- */
async function hourlyTickAccounts() {
  const users = await auth.listUsers(1000);
  const logs = [];
  for (const u of users.users) {
    for (const acct of ACCOUNT_TYPES) {
      const accountRef = getAccountRef(u.uid, acct);

      // Ensure account exists
      await ensureAccount(accountRef);

      try {
        const made = await maybeGenerate(accountRef);
        if (made) logs.push(`${u.uid} [${acct}]: ${made.merchant} $${made.amount}`);
      } catch (e) {
        console.error(`Error generating txn for ${u.uid}/${acct}`, e);
      }
    }
  }
  return logs;
}

/* ----------------- Scheduled function (LA time) ----------------- */
exports.generateRandomTransactions = onSchedule(
  { schedule: '0 * * * *', timeZone: TIMEZONE }, // top of every hour, LA time
  async () => {
    try {
      const out = await hourlyTickAccounts();
      console.log('Hourly tick created', out.length, 'transactions');
    } catch (e) {
      console.error('Scheduled error', e);
    }
  }
);

/* ----------------- Manual "Generate Now" (LA daily cap) ----------------- */
exports.tick = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!idToken) return res.status(401).json({ error: 'Missing Bearer token' });

    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const acct = normalizeAccount(req.query.account || 'checking');
    const accountRef = getAccountRef(uid, acct);

    // Ensure account exists
    await ensureAccount(accountRef);

    const dateStr = laDateKey(); // LA day
    const { ref: counterRef, used, cap } = await getManualCounter(accountRef, dateStr);

    if (used >= cap) {
      return res.status(429).json({ error: 'daily_limit_reached', used, cap, remaining: 0, account: acct });
    }

    const txn = await makeTransaction(accountRef, 'manual'); // manual -> highlighted
    await counterRef.update({ used: FieldValue.increment(1) });

    const afterSnap = await counterRef.get();
    const afterUsed = (afterSnap.data().used || used + 1);
    const remaining = Math.max(0, cap - afterUsed);

    return res.status(200).json({ ok: true, remaining, item: txn, account: acct });
  } catch (e) {
    console.error('Tick error', e);
    return res.status(500).json({ error: String(e) });
  }
});

/* ----------------- Minimal API (account + transactions) ----------------- */
exports.api = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Normalize so both "/account" and "/api/account" work
  const normPath = String(req.path || req.url || '').replace(/\/+$/, '');

  try {
    const idToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!idToken) return res.status(401).json({ error: 'Missing Bearer token' });

    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const acct = normalizeAccount(req.query.account || 'checking');
    const accountRef = getAccountRef(uid, acct);

    // Ensure account exists
    const accountSnap = await ensureAccount(accountRef);

    // GET /account
    if (req.method === 'GET' && (normPath === '/account' || normPath.endsWith('/account'))) {
      const data = accountSnap.data();
      return res.json({
        account: acct,
        accountNumber: data.accountNumber,
        last4: String(data.accountNumber || '').slice(-4),
        cvv: data.cvv,
        expiry: data.expiry,
        createdAt: data.createdAt,
      });
    }

    // GET /transactions
    if (req.method === 'GET' && (normPath === '/transactions' || normPath.endsWith('/transactions'))) {
      const { limit = '200', since } = req.query;
      const sinceMs = since ? Date.parse(String(since)) : 0;

      const q = accountRef.collection('transactions')
        .orderBy('timestamp', 'desc')
        .limit(Number(limit));

      const snap = await q.get();
      const txns = [];
      snap.forEach((doc) => {
        const t = doc.data();
        // Normalize Firestore Timestamp -> JS Date -> ISO string
        let tsVal;
        if (t.timestamp && typeof t.timestamp.toDate === 'function') {
          tsVal = t.timestamp.toDate();
        } else if (t.timestamp && typeof t.timestamp === 'object' && Number.isFinite(t.timestamp._seconds)) {
          tsVal = new Date(t.timestamp._seconds * 1000);
        } else if (t.timestamp) {
          tsVal = new Date(t.timestamp);
        } else {
          tsVal = new Date();
        }
        if (!sinceMs || tsVal.getTime() >= sinceMs) {
          // keep source field (manual/auto) and recompute LA date
          txns.push({ ...t, timestamp: tsVal.toISOString(), date: laDateKey(tsVal) });
        }
      });

      txns.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return res.json({ account: acct, items: txns.slice(0, Number(limit)) });
    }

    return res.status(404).json({ error: 'Not found', path: normPath });
  } catch (e) {
    console.error('API error', e);
    return res.status(500).json({ error: String(e) });
  }
});
