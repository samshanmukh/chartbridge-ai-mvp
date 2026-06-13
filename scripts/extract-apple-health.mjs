// One-time extractor: streams Sam's 504MB Apple Health export.xml and emits a
// compact, demo-ready summary (latest values + monthly trends + sleep/SpO2
// signals + ECG classifications) to lib/sam-health.json. Real data only.
//
// Usage: node scripts/extract-apple-health.mjs [/path/to/apple_health_export]
import { createReadStream, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EXPORT_DIR = process.argv[2] || "/Users/viper/Downloads/apple_health_export";
const XML = join(EXPORT_DIR, "export.xml");
const OUT = join(ROOT, "lib", "sam-health.json");

// --- Apple date "2024-01-01 08:00:00 -0500" -> epoch ms ---
function parseAppleDate(s) {
  if (!s) return NaN;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2})(\d{2})$/);
  if (!m) return Date.parse(s);
  return Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
}
const ym = (ms) => new Date(ms).toISOString().slice(0, 7);
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

// Quantity metrics we summarize: latest value + monthly-average trend.
const QTY = {
  RestingHeartRate: { unit: "bpm", trend: true },
  HeartRateVariabilitySDNN: { unit: "ms", trend: true },
  VO2Max: { unit: "mL/kg·min", trend: true },
  RespiratoryRate: { unit: "breaths/min", trend: false },
  OxygenSaturation: { unit: "%", trend: false },
  WalkingHeartRateAverage: { unit: "bpm", trend: false },
  StepCount: { unit: "steps", trend: false, daily: true },
  BodyMass: { unit: "lb", trend: false },
  Height: { unit: "ft", trend: false },
};

const agg = {};
for (const k of Object.keys(QTY)) {
  agg[k] = { n: 0, sum: 0, min: Infinity, max: -Infinity, lastMs: -Infinity, last: null, unit: QTY[k].unit, monthly: {} };
}
// SpO2 nocturnal-hypoxia signal
const spo2 = { n: 0, below90: 0, below95: 0, min: Infinity, sum: 0 };
// StepCount daily totals
const stepsByDay = {};
// Sleep: asleep duration per night + awakenings
const sleep = { asleepMsByNight: {}, awakenings: 0, nights: new Set() };
let recordCount = 0;

const reType = /type="HK(?:Quantity|Category)TypeIdentifier(\w+)"/;
const reVal = /value="([^"]*)"/;
const reStart = /startDate="([^"]*)"/;
const reEnd = /endDate="([^"]*)"/;

const rl = createInterface({ input: createReadStream(XML), crlfDelay: Infinity });

for await (const line of rl) {
  if (line.indexOf("<Record") === -1) continue;
  const tm = line.match(reType);
  if (!tm) continue;
  recordCount++;
  const type = tm[1];

  if (type === "SleepAnalysis") {
    const v = (line.match(reVal)?.[1] || "").toLowerCase();
    const s = parseAppleDate(line.match(reStart)?.[1]);
    const e = parseAppleDate(line.match(reEnd)?.[1]);
    if (isNaN(s)) continue;
    const night = day(s);
    sleep.nights.add(night);
    if (v.includes("awake")) sleep.awakenings++;
    else if (v.includes("asleep") && !isNaN(e)) {
      sleep.asleepMsByNight[night] = (sleep.asleepMsByNight[night] || 0) + (e - s);
    }
    continue;
  }

  const conf = QTY[type];
  if (!conf && type !== "OxygenSaturation") continue;

  const rawVal = line.match(reVal)?.[1];
  if (rawVal == null || rawVal === "") continue;
  let val = Number(rawVal);
  if (!isFinite(val)) continue;
  const ms = parseAppleDate(line.match(reStart)?.[1]);

  if (type === "OxygenSaturation") {
    if (val <= 1) val *= 100; // Apple stores SpO2 as a fraction
    spo2.n++; spo2.sum += val; spo2.min = Math.min(spo2.min, val);
    if (val < 90) spo2.below90++;
    if (val < 95) spo2.below95++;
  }

  if (!conf) continue;
  if (type === "StepCount") {
    if (!isNaN(ms)) stepsByDay[day(ms)] = (stepsByDay[day(ms)] || 0) + val;
  }
  const a = agg[type];
  a.n++; a.sum += val; a.min = Math.min(a.min, val); a.max = Math.max(a.max, val);
  if (!isNaN(ms) && ms > a.lastMs) { a.lastMs = ms; a.last = val; }
  if (conf.trend && !isNaN(ms)) {
    const k = ym(ms);
    (a.monthly[k] ??= { n: 0, sum: 0 });
    a.monthly[k].n++; a.monthly[k].sum += val;
  }
}

// --- shape the summary ---
const round = (x, d = 1) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const summ = {};
for (const [k, a] of Object.entries(agg)) {
  if (!a.n) continue;
  const monthly = Object.entries(a.monthly)
    .sort(([x], [y]) => (x < y ? -1 : 1))
    .map(([month, m]) => ({ month, avg: round(m.sum / m.n) }));
  summ[k] = {
    unit: a.unit,
    latest: round(a.last),
    avg: round(a.sum / a.n),
    min: round(a.min),
    max: round(a.max),
    n: a.n,
    ...(monthly.length ? { trend: monthly.slice(-18) } : {}),
  };
}

// daily steps average
const stepDays = Object.values(stepsByDay);
const stepsAvg = stepDays.length ? Math.round(stepDays.reduce((s, x) => s + x, 0) / stepDays.length) : null;

// sleep nightly average (hours)
const nightlyHrs = Object.values(sleep.asleepMsByNight).map((ms) => ms / 3.6e6).filter((h) => h > 1 && h < 16);
const sleepAvg = nightlyHrs.length ? round(nightlyHrs.reduce((s, x) => s + x, 0) / nightlyHrs.length) : null;

// --- ECG classifications from electrocardiograms/*.csv ---
let ecg = [];
try {
  const dir = join(EXPORT_DIR, "electrocardiograms");
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".csv"));
  for (const f of files) {
    const head = readFileSync(join(dir, f), "utf8").split("\n").slice(0, 12).join("\n");
    const cls = head.match(/Classification,?\s*(.+)/i)?.[1]?.trim();
    const date = head.match(/Recorded Date,?\s*(.+)/i)?.[1]?.trim() || head.match(/Date of Birth/i) ? undefined : undefined;
    const recorded = head.match(/Recorded Date,?\s*(.+)/i)?.[1]?.trim();
    if (cls) ecg.push({ file: f, classification: cls.replace(/,.*$/, ""), recorded: recorded || null });
  }
  ecg.sort((a, b) => String(b.recorded).localeCompare(String(a.recorded)));
} catch {}

const out = {
  meta: {
    source: "Apple Health export (real)",
    extractedFrom: EXPORT_DIR,
    totalRecordsScanned: recordCount,
  },
  metrics: summ,
  steps: { avgPerDay: stepsAvg, daysTracked: stepDays.length },
  sleep: {
    avgNightlyHours: sleepAvg,
    nightsTracked: sleep.nights.size,
    awakenings: sleep.awakenings,
  },
  spo2: spo2.n
    ? {
        unit: "%",
        avg: round(spo2.sum / spo2.n),
        min: round(spo2.min),
        readings: spo2.n,
        below95: spo2.below95,
        below90: spo2.below90,
        pctBelow95: round((spo2.below95 / spo2.n) * 100),
      }
    : null,
  ecg: { count: ecg.length, latest: ecg[0] || null, classifications: [...new Set(ecg.map((e) => e.classification))] },
};

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log("Scanned records:", recordCount.toLocaleString());
console.log(JSON.stringify(out, null, 2));
console.log("\nWrote", OUT);
