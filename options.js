(async () => {
  const { settings = {} } = await browser.storage.local.get("settings");
  const current = settings.source ?? "spotlight";
  for (const input of document.querySelectorAll('input[name="source"]')) {
    input.checked = input.value === current;
    input.addEventListener("change", () =>
      browser.storage.local.set({ settings: { ...settings, source: input.value } })
    );
  }
})();
