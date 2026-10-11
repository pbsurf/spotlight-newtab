// Bing image of the day. idx=0 is today; the archive goes back 7 more days.

const BASE = "https://www.bing.com";

export async function fetchLatest({ random = false } = {}) {
  const mkt = navigator.language || "en-US";
  const idx = random ? 1 + Math.floor(Math.random() * 7) : 0;
  const params = new URLSearchParams({ format: "js", idx: String(idx), n: "1", mkt });
  const res = await fetch(`${BASE}/HPImageArchive.aspx?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Bing API HTTP ${res.status}`);
  const img = (await res.json())?.images?.[0];
  if (!img) throw new Error("Bing API: no images");

  // "Caption, Place (© Credit/Agency)"
  const m = /^(.*?)\s*\((©[^)]*)\)\s*$/.exec(img.copyright || "");
  const caption = m ? m[1] : img.copyright || "";
  const copyright = m ? m[2] : "";

  // UHD is only offered for images licensed as wallpapers (wp: true).
  const imageUrl = BASE + (img.wp ? `${img.urlbase}_UHD.jpg` : img.url);

  return {
    source: "bing",
    id: img.hsh || img.urlbase,
    imageUrl,
    portraitUrl: null,
    title: img.title || "",
    description: "",
    caption,
    copyright,
    link: img.copyrightlink || null,
  };
}
