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
  $("copyright").textContent = img.copyright;
  const learn = $("learn");
  learn.hidden = !img.link;
  if (img.link) learn.href = img.link;
  $("info").hidden = false;
}

function tickClock() {
  $("clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function main() {
  tickClock();
  setInterval(tickClock, 1000);

  const { current, settings } = await browser.storage.local.get(["current", "settings"]);
  await render(current);

  // Re-render whenever the background stores a new image (refresh, ↻, source switch).
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.current?.newValue) render(changes.current.newValue);
  });

  // Stale, missing, or from another source? Ask the background to fetch, then re-render.
  const today = new Date().toLocaleDateString("en-CA");
  const source = settings?.source ?? "spotlight";
  if (!current || current.date !== today || current.source !== source) {
    browser.runtime.sendMessage({ type: "refresh" }).catch(console.error);
  }

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
