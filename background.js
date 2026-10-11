import * as spotlight from "./sources/spotlight.js";
import * as bing from "./sources/bing.js";

const SOURCES = { spotlight, bing };
const CACHE_NAME = "images";
const ALARM = "refresh";

function today() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
}

async function cacheImage(url) {
  const cache = await caches.open(CACHE_NAME);
  if (await cache.match(url)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image HTTP ${res.status}`);
  // The CDN serves JPEGs as text/plain; store them with a proper image type.
  const blob = await res.blob();
  const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  await cache.put(url, new Response(blob, { headers: { "Content-Type": type } }));
}

async function pruneCache(keep) {
  const cache = await caches.open(CACHE_NAME);
  for (const req of await cache.keys()) {
    if (!keep.includes(req.url)) await cache.delete(req);
  }
}

// Fetch a new image if we don't have one for today (or if forced).
async function refresh({ force = false } = {}) {
  const { current, settings } = await browser.storage.local.get(["current", "settings"]);
  const sourceName = settings?.source ?? "spotlight";
  if (!force && current?.date === today() && current.source === sourceName) return current;

  const source = SOURCES[sourceName] ?? spotlight;
  // A forced refresh on the same day means "give me a different one".
  const image = await source.fetchLatest({ random: force && current?.date === today() });
  await cacheImage(image.imageUrl);

  const next = { ...image, date: today(), fetchedAt: Date.now() };
  const keep = [next.imageUrl];
  if (current?.imageUrl) keep.push(current.imageUrl);
  await browser.storage.local.set({ current: next, previous: current ?? null });
  await pruneCache(keep);
  return next;
}

let inflight = null;
function refreshOnce(opts) {
  inflight ??= refresh(opts).finally(() => (inflight = null));
  return inflight;
}

browser.runtime.onInstalled.addListener(() => refreshOnce().catch(console.error));
browser.runtime.onStartup.addListener(() => refreshOnce().catch(console.error));

browser.alarms.create(ALARM, { periodInMinutes: 60 });
browser.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) refreshOnce().catch(console.error);
});

// Switching source in the options page fetches from the new source right away.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) refreshOnce().catch(console.error);
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "refresh") return refreshOnce({ force: !!msg.force });
});
