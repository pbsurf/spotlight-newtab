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

async function getSites(count) {
  const sites = await browser.topSites.get({ newtab: true, includeFavicon: true });
  if (sites.length >= count) return sites.slice(0, count);
  // Firefox's list may be capped at its own row setting; top up from history.
  const seen = new Set(sites.map((s) => hostOf(s.url)));
  const more = await browser.topSites.get({ limit: count * 2, onePerDomain: true, includeFavicon: true });
  for (const s of more) {
    if (sites.length >= count) break;
    if (seen.has(hostOf(s.url))) continue;
    seen.add(hostOf(s.url));
    sites.push(s);
  }
  return sites;
}

// The same list Firefox's own new tab shows (pinned + frequently visited).
async function renderShortcuts(rows) {
  const sites = await getSites(rows * 8);
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
      label.textContent = host.split(".").slice(0, -1).join(".") || host;

      a.append(icon, label);
      return a;
    })
  );
  nav.hidden = sites.length === 0;
}

function applyShortcutsHidden(hidden) {
  $("shortcuts").classList.toggle("off", hidden);
  $("toggle").classList.toggle("off", hidden);
  $("toggle").title = hidden ? "Show shortcuts" : "Hide shortcuts";
}

async function main() {
  const { current, settings, hideShortcuts = false, shortcutRows = 1 } =
    await browser.storage.local.get(["current", "settings", "hideShortcuts", "shortcutRows"]);
  applyShortcutsHidden(hideShortcuts);
  renderShortcuts(shortcutRows).catch(console.error);
  await render(current);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    // Re-render whenever the background stores a new image (refresh, ↻, source switch).
    if (changes.current?.newValue) render(changes.current.newValue);
    // Keep the shortcuts toggle in sync across open tabs.
    if (changes.hideShortcuts) applyShortcutsHidden(!!changes.hideShortcuts.newValue);
    if (changes.shortcutRows) renderShortcuts(changes.shortcutRows.newValue ?? 1).catch(console.error);
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
