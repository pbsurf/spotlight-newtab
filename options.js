const $ = (id) => document.getElementById(id);

async function getSettings() {
  return (await browser.storage.local.get("settings")).settings ?? {};
}

async function updateSettings(patch) {
  await browser.storage.local.set({ settings: { ...(await getSettings()), ...patch } });
}

// "URL [title]" per line → [{ url, title }]; throws on anything that isn't an http(s) URL.
function parseUrls(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [first, ...rest] = line.split(/\s+/);
      let url;
      try {
        url = new URL(first);
      } catch {
        throw new Error(`Not a URL: ${first}`);
      }
      if (!/^https?:$/.test(url.protocol)) throw new Error(`Not http(s): ${first}`);
      return { url: url.href, title: rest.join(" ") };
    });
}

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
}

(async () => {
  const settings = await getSettings();
  const { shortcutRows = 1 } = await browser.storage.local.get("shortcutRows");

  const source = settings.source ?? "spotlight";
  for (const input of document.querySelectorAll('input[name="source"]')) {
    input.checked = input.value === source;
    input.addEventListener("change", () => updateSettings({ source: input.value }));
  }

  $("custom-urls").value = (settings.customUrls ?? [])
    .map(({ url, title }) => (title ? `${url}  ${title}` : url))
    .join("\n");

  $("save").addEventListener("click", async () => {
    let list;
    try {
      list = parseUrls($("custom-urls").value);
    } catch (e) {
      return setStatus(e.message, true);
    }
    // Must be requested directly from the click handler.
    const origins = [...new Set(list.map(({ url }) => `${new URL(url).origin}/*`))];
    if (origins.length && !(await browser.permissions.request({ origins }))) {
      return setStatus("Permission to access those sites was denied; not saved.", true);
    }
    await updateSettings({ customUrls: list });

    if ((await getSettings()).source !== "custom") return setStatus("Saved.");
    setStatus("Saved, loading…");
    try {
      await browser.runtime.sendMessage({ type: "refresh", force: true });
      setStatus("Saved.");
    } catch (e) {
      setStatus(`Saved, but loading failed: ${e.message}`, true);
    }
  });

  const rows = $("rows");
  rows.value = String(shortcutRows);
  rows.addEventListener("change", () =>
    browser.storage.local.set({ shortcutRows: Number(rows.value) })
  );
})();
