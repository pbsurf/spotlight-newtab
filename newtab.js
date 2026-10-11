const $ = (id) => document.getElementById(id);

// Cached copy as a blob: URL (caller revokes it), else the original URL.
async function imageSrc(url) {
  try {
    const hit = await (await caches.open("images")).match(url);
    if (hit) return URL.createObjectURL(await hit.blob());
  } catch (e) {
    console.warn("cache lookup failed", e);
  }
  return url; // fall back to network
}

const revoke = (src) => src.startsWith("blob:") && URL.revokeObjectURL(src);

// Background layers, oldest first. The first image appears at once; later ones
// (↻, source switch, daily update) cross-fade in on a new layer over the old.
let layers = [];
async function showImage(src, isCurrent) {
  const pre = new Image();
  pre.src = src;
  try {
    await pre.decode(); // avoid showing a half-decoded image
    if (!isCurrent()) throw new Error("superseded");
  } catch {
    revoke(src);
    return false;
  }
  const el = document.createElement("div");
  el.className = "bg";
  el.style.backgroundImage = `url("${src}")`;
  const layer = { el, src };
  const old = layers;
  layers = [...old, layer];

  const fade = old.length && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (old.length) old.at(-1).el.after(el);
  else document.body.prepend(el);
  if (!fade) return dropBelow(layer), true;

  el.classList.add("fading");
  el.getBoundingClientRect(); // commit opacity 0 so the transition runs
  el.classList.add("in");
  el.addEventListener("transitionend", () => dropBelow(layer), { once: true });
  setTimeout(() => dropBelow(layer), 1000); // transitionend may not fire, e.g. in a hidden tab
  return true;
}

// Remove (and free) every layer under `layer`, once it fully covers them.
function dropBelow(layer) {
  const i = layers.indexOf(layer);
  if (i < 1) return;
  for (const { el, src } of layers.slice(0, i)) {
    el.remove();
    revoke(src);
  }
  layers = layers.slice(i);
}

let renderSeq = 0;
async function render(img) {
  if (!img) return;
  const seq = ++renderSeq;
  const src = await imageSrc(img.imageUrl);
  if (seq !== renderSeq) return revoke(src); // a newer render started meanwhile
  if (!(await showImage(src, () => seq === renderSeq))) return;

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

  // In "every new tab" mode, opening a tab fetches the image for the *next* tab;
  // open tabs keep theirs unless their own ↻ was clicked.
  let interval = settings?.interval ?? "daily";
  let shown = !!current;
  let wantUpdate = false;

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) interval = changes.settings.newValue?.interval ?? "daily";
    // Show a newly stored image (scheduled update, ↻, source switch).
    const next = changes.current?.newValue;
    if (next && (interval !== "tab" || !shown || wantUpdate)) {
      shown = true;
      wantUpdate = false;
      render(next);
    }
    // Keep the shortcuts toggle in sync across open tabs.
    if (changes.lastError) renderError(changes.lastError.newValue ?? null);
    if (changes.hideShortcuts) applyShortcutsHidden(!!changes.hideShortcuts.newValue);
  });

  // The background decides whether the image is due for a change.
  browser.runtime.sendMessage({ type: "refresh", newTab: true }).catch(console.error);

  $("toggle").addEventListener("click", () => {
    const hidden = !$("shortcuts").classList.contains("off");
    applyShortcutsHidden(hidden);
    browser.storage.local.set({ hideShortcuts: hidden });
  });

  $("next").addEventListener("click", async () => {
    const btn = $("next");
    btn.classList.add("spinning");
    wantUpdate = true;
    try {
      await browser.runtime.sendMessage({ type: "refresh", force: true });
    } catch (e) {
      wantUpdate = false;
      console.error(e);
    } finally {
      btn.classList.remove("spinning");
    }
  });
}

main();
