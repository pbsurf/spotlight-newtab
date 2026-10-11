# Daily Image New Tab

Firefox extension that replaces the new tab page with a daily background image,
from **Windows Spotlight** (Windows 11 desktop API) or **Bing image of the day**.
Pick the source in about:addons → the extension → Options.

- A new image is fetched once per day (checked hourly, on startup, and when a new tab opens).
- The image is stored in the extension's Cache Storage, so new tabs load instantly and work offline.
- Hover the caption to see the description; ↻ fetches a different image now.

## Try it

    about:debugging#/runtime/this-firefox → Load Temporary Add-on… → pick manifest.json

or with web-ext:

    npx web-ext run          # launches Firefox with the extension
    npx web-ext lint
    npx web-ext build        # produces a .zip for AMO / self-distribution

## Adding sources

Each module in `sources/` exports `fetchLatest()` returning
`{ id, imageUrl, title, caption, description, copyright, link }`.
Register it in `SOURCES` in `background.js`, add its image host to
`host_permissions`, and add a radio button for it in `options.html`.
