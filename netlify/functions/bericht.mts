/* Level Up 4 · Wochenbericht für Eltern
   POST /api/bericht   { id, snap }  – die App schickt eine kurze Zusammenfassung des Lernstands
   GET  /api/bericht?id=…            – lesbarer Bericht (HTML), ?format=json für die Rohdaten
   Gespeichert wird nur auf Geräten, die mit einem persönlichen Bericht-Link eingeschaltet wurden.
   Pro Woche wird der letzte Stand aufgehoben, damit der Bericht den Fortschritt zur Vorwoche zeigen kann. */
import { getStore } from "@netlify/blobs";

const ID_RE = /^[a-z0-9-]{8,60}$/;
const MAX_BYTES = 200_000;

type Snap = {
  v: number; t: number; name?: string;
  act: { d: string; c: Record<string, number>; p: boolean }[];
  types: { k: string; l: string; g: string; lv: string; h: string; w: boolean }[];
  regeln: { r: string; lv: string; h: string }[];
  fehler: { l: string; q: string; a: string; n: number; ok: number }[];
  offen: number;
  probes: { n: string; d: string; g: number }[];
  tests: { w: string; d: string }[];
  sterne: number;
};
type Doc = { latest?: Snap; weeks?: Record<string, Snap> };

function store() { return getStore({ name: "lu4-bericht", consistency: "strong" }); }

function weekKey(t: number) {
  const d = new Date(t + 3600_000); // grob deutsche Zeit
  const day = (d.getUTCDay() + 6) % 7; // Montag = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const SUBJ: Record<string, string> = { m: "Mathe", d: "Deutsch", su: "Sachunterricht", mu: "Musik", en: "Englisch" };
const LV: Record<string, string> = { good: "sitzt", ok: "fast", weak: "übt noch", new: "neu" };
const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${+d}.${+m}.${y}`; };
const fmtDay = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "Europe/Berlin" });

function render(doc: Doc): string {
  const s = doc.latest!;
  const name = s.name || "";
  const wk = weekKey(s.t);
  const prevKeys = Object.keys(doc.weeks || {}).filter((k) => k < wk).sort();
  const prev = prevKeys.length ? doc.weeks![prevKeys[prevKeys.length - 1]] : undefined;
  const last7 = s.act.slice(-7), prev7 = s.act.slice(-14, -7);
  const sum = (a: Snap["act"]) => a.reduce((n, x) => n + Object.values(x.c || {}).reduce((m, v) => m + v, 0), 0);
  const dayCount = last7.filter((x) => Object.keys(x.c || {}).length).length;
  const planDays = last7.filter((x) => x.p).length;
  const perSubj: Record<string, number> = {};
  last7.forEach((x) => Object.entries(x.c || {}).forEach(([k, v]) => { perSubj[k] = (perSubj[k] || 0) + v; }));
  const updated = new Date(s.t).toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  const weak = s.types.filter((t) => t.lv === "weak");
  const ok = s.types.filter((t) => t.lv === "ok");
  const good = s.types.filter((t) => t.lv === "good");
  const prevLv: Record<string, string> = {};
  (prev?.types || []).forEach((t) => { prevLv[t.k] = t.lv; });
  const better = s.types.filter((t) => prevLv[t.k] && (prevLv[t.k] === "weak" && t.lv !== "weak" || prevLv[t.k] === "ok" && t.lv === "good"));
  const worse = s.types.filter((t) => prevLv[t.k] && (prevLv[t.k] === "good" && t.lv !== "good" || prevLv[t.k] === "ok" && t.lv === "weak"));
  const list = (a: Snap["types"]) => a.map((t) => `${esc(t.l)}${t.g ? ` <small>(${esc(t.g)})</small>` : ""}`).join(", ");

  let h = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Lernstand${name ? " " + esc(name) : ""} – Level Up 4</title>
<style>body{font:16px/1.5 system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;padding:16px;color:#1d2238;background:#fbf8f2}h1{font-size:1.4rem;margin:.2em 0}h2{font-size:1.1rem;margin:1.4em 0 .4em;border-bottom:2px solid #e8e1d3;padding-bottom:4px}small{color:#666}ul{padding-left:1.2em}li{margin:.25em 0}.k{display:inline-block;padding:1px 8px;border-radius:10px;font-size:.85rem}.weak{background:#ffd9cf}.ok{background:#fff0c2}.good{background:#d3f3df}.new{background:#eee}.box{background:#fff;border-radius:14px;padding:10px 14px;margin:8px 0;box-shadow:0 1px 3px #0001}</style></head><body>`;
  h += `<h1>Lernstand${name ? " " + esc(name) : ""} · Level Up 4</h1><p><small>Stand: ${esc(updated)} (zuletzt geübt bzw. App zuletzt geöffnet)</small></p>`;

  h += `<h2>Übungszeit (letzte 7 Tage)</h2><div class="box"><p><b>${dayCount} von 7 Tagen</b> geübt · <b>${sum(last7)} Aufgaben</b>${prev7.length ? ` (Woche davor: ${sum(prev7)})` : ""} · Tagesplan ganz geschafft an <b>${planDays} Tagen</b>.</p>`;
  h += `<p>Nach Fach: ${Object.keys(perSubj).length ? Object.entries(perSubj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${SUBJ[k] || k} ${v}`).join(" · ") : "–"}</p>`;
  h += `<p><small>${last7.map((x) => `${fmtDay(x.d)}: ${Object.values(x.c || {}).reduce((m, v) => m + v, 0)}${x.p ? " ⭐" : ""}`).join(" · ")}</small></p></div>`;

  if (s.tests?.length) h += `<h2>Anstehende Arbeiten</h2><ul>${s.tests.map((t) => `<li>${fmtDate(t.d)}: ${esc(t.w)}</li>`).join("")}</ul>`;

  h += `<h2>Was noch nicht sitzt</h2>`;
  h += weak.length ? `<p><span class="k weak">übt noch</span> ${list(weak)}</p>` : `<p>Aktuell kein Thema im roten Bereich. 👍</p>`;
  if (ok.length) h += `<p><span class="k ok">fast</span> ${list(ok)}</p>`;
  if (good.length) h += `<p><span class="k good">sitzt</span> ${good.length} Themen, z. B. ${list(good.slice(-6))}</p>`;

  if (prev) {
    h += `<h2>Veränderung zur Vorwoche</h2>`;
    h += better.length ? `<p>Besser geworden: ${list(better)}</p>` : `<p>Keine Themen, die sich deutlich verbessert haben.</p>`;
    if (worse.length) h += `<p>Wieder wackliger: ${list(worse)}</p>`;
  }

  const rWeak = (s.regeln || []).filter((r) => r.lv === "weak" || r.lv === "ok");
  if (s.regeln?.length) {
    h += `<h2>Baderegeln einzeln</h2><p>${s.regeln.filter((r) => r.lv === "good").length} von ${s.regeln.length} geübten Regeln sitzen.</p>`;
    if (rWeak.length) h += `<ul>${rWeak.map((r) => `<li><span class="k ${r.lv}">${LV[r.lv]}</span> ${esc(r.r)}</li>`).join("")}</ul>`;
  }

  h += `<h2>Typische Fehler (werden automatisch wiederholt)</h2>`;
  h += s.fehler?.length ? `<p><small>${s.offen} Aufgaben stehen gerade auf der Wiederholungsliste. Eine Aufgabe verschwindet erst, wenn sie zweimal hintereinander klappt.</small></p><ul>${s.fehler.map((f) => `<li><b>${esc(f.l)}</b>${f.n > 1 ? ` <small>(${f.n}× falsch)</small>` : ""}: ${esc(f.q)} → <i>richtig: ${esc(f.a)}</i></li>`).join("")}</ul>` : `<p>Keine offenen Fehler. 👍</p>`;

  if (s.probes?.length) h += `<h2>Probearbeiten (letzte 14 Tage)</h2><ul>${s.probes.map((p) => `<li>${fmtDate(p.d)}: ${esc(p.n)} – Note ${p.g}</li>`).join("")}</ul>`;

  h += `<p><small>Sterne gesamt: ${s.sterne ?? 0}. Die App merkt sich für jedes Thema die letzten Ergebnisse; „sitzt“ heißt: mindestens 80 % der letzten Versuche beim ersten Mal richtig.</small></p></body></html>`;
  return h;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "POST") {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return Response.json({ error: "too large" }, { status: 413 });
    let body: any;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
    const id = String(body?.id || "").toLowerCase();
    if (!ID_RE.test(id) || !body.snap || typeof body.snap !== "object") return Response.json({ error: "bad request" }, { status: 400 });
    const snap = body.snap as Snap;
    if (!Array.isArray(snap.act) || !Array.isArray(snap.types)) return Response.json({ error: "bad snap" }, { status: 400 });
    snap.t = Date.now();
    const doc = ((await store().get(id, { type: "json" })) as Doc | null) || {};
    doc.latest = snap;
    doc.weeks = doc.weeks || {};
    doc.weeks[weekKey(snap.t)] = snap;
    const keys = Object.keys(doc.weeks).sort();
    while (keys.length > 10) delete doc.weeks[keys.shift()!];
    await store().setJSON(id, doc);
    return Response.json({ ok: true });
  }
  if (req.method === "GET") {
    const id = (url.searchParams.get("id") || "").toLowerCase();
    if (!ID_RE.test(id)) return new Response("Ungültiger Code", { status: 400 });
    const doc = (await store().get(id, { type: "json" })) as Doc | null;
    if (!doc?.latest) return new Response("Noch kein Lernstand angekommen. Bitte den Bericht-Link einmal auf dem Gerät öffnen, mit dem geübt wird, und eine Runde üben.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    if (url.searchParams.get("format") === "json") return Response.json(doc, { headers: { "cache-control": "no-store" } });
    return new Response(render(doc), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/bericht", method: ["GET", "POST"] };
