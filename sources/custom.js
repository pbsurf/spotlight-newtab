// User-supplied image URLs (Options page). One per day in list order; ↻ picks another at random.
// The same URL may serve a new image each time (e.g. a webcam), so it's re-fetched every refresh.

function dayNumber() {
  const now = new Date();
  return Math.floor((now - now.getTimezoneOffset() * 60000) / 86400000);
}

function fileName(url) {
  const last = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  return last.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ") || new URL(url).hostname;
}

export async function fetchLatest({ random = false, current = null } = {}) {
  const { settings } = await browser.storage.local.get("settings");
  const list = settings?.customUrls ?? [];
  if (!list.length) throw new Error("No custom image URLs configured");

  let pick = list[dayNumber() % list.length];
  if (random) {
    const others = list.filter(({ url }) => url !== current?.imageUrl);
    // With nothing else to pick, re-fetch the same URL (useful for webcams).
    if (others.length) pick = others[Math.floor(Math.random() * others.length)];
  }
  const { url, title } = pick;
  return {
    source: "custom",
    id: url,
    imageUrl: url,
    portraitUrl: null,
    title: title || fileName(url),
    description: "",
    caption: "",
    copyright: new URL(url).hostname,
    link: url,
  };
}
