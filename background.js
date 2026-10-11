import * as spotlight from "./sources/spotlight.js";
import * as bing from "./sources/bing.js";
import * as custom from "./sources/custom.js";

const SOURCES = { spotlight, bing, custom };
const CACHE_NAME = "images";
const ALARM = "refresh";

function today() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
}

// Always re-fetched: a custom URL may serve a different image each time.
async function cacheImage(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Image HTTP ${res.status}`);
  const blob = await res.blob();
  // Make sure it is actually an image before replacing the current one.
  try {
    (await createImageBitmap(blob)).close();
  } catch {
    throw new Error(`Not an image: ${url}`);
  }
  // The Spotlight CDN serves JPEGs as text/plain; store them with a proper image type.
  const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const cache = await caches.open(CACHE_NAME);
  await cache.put(url, new Response(blob, { headers: { "Content-Type": type } }));
}

async function pruneCache(keep) {
  const cache = await caches.open(CACHE_NAME);
  for (const req of await cache.keys()) {
    if (!keep.includes(req.url)) await cache.delete(req);
  }
}

// Fetch a new image if we don't have one for today (or if forced).
// Failures are recorded as `lastError` (shown in the new tab's info panel)
// until the next successful update.
async function refresh(opts) {
  try {
    return await update(opts);
  } catch (e) {
    const { settings } = await browser.storage.local.get("settings");
    const source = settings?.source ?? "spotlight";
    let message = e.message || String(e);
    // fetch() reports blocked/unreachable hosts only as a generic TypeError.
    if (e instanceof TypeError && source === "custom") {
      message += " (site unreachable, or access not allowed: save the list again in Options)";
    }
    await browser.storage.local.set({ lastError: { message, source, at: Date.now() } });
    throw e;
  }
}

async function update({ force = false } = {}) {
  const { current, settings } = await browser.storage.local.get(["current", "settings"]);
  const sourceName = settings?.source ?? "spotlight";
  if (!force && current?.date === today() && current.source === sourceName) return current;

  const source = SOURCES[sourceName] ?? spotlight;
  // A forced refresh on the same day means "give me a different one".
  const image = await source.fetchLatest({ random: force && current?.date === today(), current });
  await cacheImage(image.imageUrl);

  const next = { ...image, date: today(), fetchedAt: Date.now() };
  const keep = [next.imageUrl];
  if (current?.imageUrl) keep.push(current.imageUrl);
  await browser.storage.local.set({ current: next, previous: current ?? null, lastError: null });
  await pruneCache(keep);
  return next;
}

// Run refreshes one at a time; unforced ones return early once today's image exists.
let queue = Promise.resolve();
function refreshOnce(opts) {
  const run = queue.then(() => refresh(opts));
  queue = run.catch(() => {});
  return run;
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
