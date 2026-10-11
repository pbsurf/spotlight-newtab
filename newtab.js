const $ = (id) => document.getElementById(id);
let blobUrl = null;

async function imageSrc(url) {
  try {
    const hit = await (await caches.open("images")).match(url);
    if (hit) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      return (blobUrl = URL.createObjectURL(await hit.blob()));
    }
  } catch (e) {
    console.warn("cache lookup failed", e);
  }
  return url; // fall back to network
}

let renderSeq = 0;
async function render(img) {
  if (!img) return;
  const seq = ++renderSeq;
  const src = await imageSrc(img.imageUrl);
  if (seq !== renderSeq) return; // a newer render started meanwhile
  const bg = $("bg");
  const pre = new Image();
  pre.onload = () => {
    bg.style.backgroundImage = `url("${src}")`;
    bg.classList.add("loaded");
  };
  pre.src = src;

  $("title").textContent = img.title;
  $("caption").textContent = img.caption;
  $("description").textContent = img.description;
  $("description").hidden = !img.description;
  $("copyright").textContent = img.copyright;
  const learn = $("learn");
  learn.hidden = !img.link;
  if (img.link) learn.href = img.link;
  $("hover-label").textContent = img.caption || img.title;
  $("info-btn").hidden = false;
}

const hostOf = (url) => new URL(url).hostname.replace(/^www\./, "");

// Like Firefox's shortURL: hostname without "www." and the public suffix
// (approximated: last label, or the last two for e.g. "co.uk").
function shortName(url) {
  const host = hostOf(url);
  const short = host.replace(/\.(?:(?:co|com|org|net|gov|ac|edu)\.[a-z]{2}|[a-z0-9-]+)$/i, "");
  return short || host;
}

// Firefox's own shortcuts list, in its order, already capped at Firefox's own
// rows setting. (`limit` still applies with `newtab: true` and defaults to 12,
// so ask for the maximum.)
//
// Firefox labels each tile with the pinned site's custom label, else the short
// hostname, but the API reports `label || page title` as the title. Custom labels
// are found by comparing a pins+history list with a history-only one: a pinned
// entry carries only its label (or nothing), never the page title.
async function getSites() {
  const opts = { limit: 100, includeSearchShortcuts: true };
  const [sites, withPinned, history] = await Promise.all([
    browser.topSites.get({ newtab: true, limit: 100, includeFavicon: true }),
    browser.topSites.get({ ...opts, includePinned: true }),
    browser.topSites.get(opts),
  ]);
  const historyTitles = new Map(history.map((s) => [s.url, s.title]));
  const labels = new Map();
  for (const s of withPinned) {
    if (s.title && s.title !== historyTitles.get(s.url)) labels.set(s.url, s.title);
  }
  return sites.map((site) => ({ ...site, label: labels.get(site.url) || shortName(site.url) }));
}

// The same shortcuts Firefox's own new tab shows.
async function renderShortcuts() {
  const sites = await getSites();
  const nav = $("shortcuts");
  nav.replaceChildren(
    ...sites.map((site) => {
      const host = hostOf(site.url);
      const a = document.createElement("a");
      a.className = "tile";
      a.href = site.url;
      a.title = site.title || site.url;

      const icon = document.createElement("span");
      icon.className = "icon";
      if (site.favicon) {
        const img = document.createElement("img");
        img.src = site.favicon;
        img.alt = "";
        icon.append(img);
      } else {
        const letter = document.createElement("span");
        letter.className = "letter";
        letter.textContent = host[0] || "?";
        icon.append(letter);
      }

      const label = document.createElement("span");
      label.className = "label";
      label.textContent = site.label;

      a.append(icon, label);
      return a;
    })
  );
  nav.hidden = sites.length === 0;
}

// Last failed update (cleared by the background on the next success).
function renderError(err) {
  const el = $("error");
  el.hidden = !err;
  el.textContent = err
    ? `Couldn't load a new image (${new Date(err.at).toLocaleString()}): ${err.message}`
    : "";
  $("info-btn").classList.toggle("has-error", !!err);
  if (err) $("info-btn").hidden = false;
}

function applyShortcutsHidden(hidden) {
  $("shortcuts").classList.toggle("off", hidden);
  $("toggle").classList.toggle("off", hidden);
  $("toggle").title = hidden ? "Show shortcuts" : "Hide shortcuts";
}

async function main() {
  const { current, settings, hideShortcuts = false, lastError = null } =
    await browser.storage.local.get(["current", "settings", "hideShortcuts", "lastError"]);
  applyShortcutsHidden(hideShortcuts);
  renderShortcuts().catch(console.error);
  await render(current);
  renderError(lastError);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    // Re-render whenever the background stores a new image (refresh, ↻, source switch).
    if (changes.current?.newValue) render(changes.current.newValue);
    // Keep the shortcuts toggle in sync across open tabs.
    if (changes.lastError) renderError(changes.lastError.newValue ?? null);
    if (changes.hideShortcuts) applyShortcutsHidden(!!changes.hideShortcuts.newValue);
  });

  // Stale, missing, or from another source? Ask the background to fetch.
  const today = new Date().toLocaleDateString("en-CA");
  const source = settings?.source ?? "spotlight";
  if (!current || current.date !== today || current.source !== source) {
    browser.runtime.sendMessage({ type: "refresh" }).catch(console.error);
  }

  $("toggle").addEventListener("click", () => {
    const hidden = !$("shortcuts").classList.contains("off");
    applyShortcutsHidden(hidden);
    browser.storage.local.set({ hideShortcuts: hidden });
  });

  $("next").addEventListener("click", async () => {
    const btn = $("next");
    btn.classList.add("spinning");
    try {
      await browser.runtime.sendMessage({ type: "refresh", force: true });
    } catch (e) {
      console.error(e);
    } finally {
      btn.classList.remove("spinning");
    }
  });
}

main();
