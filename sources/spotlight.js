// Windows Spotlight (desktop, v4 API used by Windows 11).
// Each call returns a random selection; we pick one and keep it for the day.

const ENDPOINT = "https://fd.api.iris.microsoft.com/v4/api/selection";

function localeParts() {
  const lang = navigator.language || "en-US";
  const [l, region] = lang.split("-");
  const country = (region || "US").toUpperCase();
  return { locale: `${l}-${country}`, country };
}

// Every call is already random, so the `random` option needs no handling.
export async function fetchLatest() {
  const { locale, country } = localeParts();
  const params = new URLSearchParams({
    placement: "88000820",
    bcnt: "1",
    country,
    locale,
    fmt: "json",
  });
  const res = await fetch(`${ENDPOINT}?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Spotlight API HTTP ${res.status}`);
  const body = await res.json();
  const raw = body?.batchrsp?.items?.[0]?.item;
  if (!raw) throw new Error("Spotlight API: no items");
  const ad = JSON.parse(raw).ad;

  // ctaUri looks like "microsoft-edge:https://www.bing.com/..."
  const link = (ad.ctaUri || "").replace(/^microsoft-edge:/, "") || null;

  return {
    source: "spotlight",
    id: ad.entityId || ad.landscapeImage.asset,
    imageUrl: ad.landscapeImage.asset,
    portraitUrl: ad.portraitImage?.asset ?? null,
    title: ad.title || "",
    description: ad.description || "",
    caption: (ad.iconHoverText || "").split(/\r?\n/)[0],
    copyright: ad.copyright || "",
    link,
  };
}
