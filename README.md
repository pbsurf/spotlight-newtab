# Daily Image New Tab

Firefox extension that replaces the new tab page with a daily background image,
from **Windows Spotlight** (Windows 11 desktop API), **Bing image of the day**,
or your own list of image URLs.
Pick the source in about:addons → the extension → Options.

- The image changes every new tab, hourly, daily (default), weekly or never (Options page).
- The image is stored in the extension's Cache Storage, so new tabs load instantly and work offline.
- Shows the same shortcuts as Firefox's own new tab (pinned + frequently visited); the grid button hides them.
- Source: Windows Spotlight, Bing, or your own list of image URLs (Options page).
- The italic "i" button shows the image title, description and credit; ↻ fetches a different image now.

## Try it

    about:debugging#/runtime/this-firefox → Load Temporary Add-on… → pick manifest.json

or with web-ext:

    npx web-ext run          # launches Firefox with the extension
    npx web-ext lint
    npx web-ext build        # produces a .zip for AMO / self-distribution

## Build

Raise `version` in `manifest.json` for each release (Firefox only installs a
higher version over an existing one), then package from the repo root:

    zip -r daily-image-newtab.xpi manifest.json background.js newtab.* options.* sources icons

## Install permanently

Requires Firefox 128 or later. The extension isn't signed by Mozilla, so how to
install it depends on the Firefox edition.

### Firefox ESR, Developer Edition, Nightly

These can run unsigned extensions once signature checking is turned off:

1. In `about:config`, set `xpinstall.signatures.required` to `false`.
2. In `about:addons`, ⚙ → **Install Add-on From File…** → pick the `.xpi`.
3. Accept the permissions prompt.

To update, install a newer `.xpi` the same way; settings are kept.

Note that turning off signature checking applies to all add-ons in that profile.

### Regular Firefox (release, beta)

These only accept extensions signed by Mozilla. Signing as an *unlisted* add-on
is free and automatic, and the add-on isn't published on addons.mozilla.org:

1. Create an account on addons.mozilla.org and generate API credentials
   (Developer Hub → Tools → Manage API Keys).
2. Run:

       npx web-ext sign --channel=unlisted --api-key=… --api-secret=…

3. Install the signed `.xpi` from `web-ext-artifacts/` via `about:addons` as above.

## Adding sources

Each module in `sources/` exports `fetchLatest()` returning
`{ id, imageUrl, title, caption, description, copyright, link }`.
Register it in `SOURCES` in `background.js`, add its image host to
`host_permissions`, and add a radio button for it in `options.html`.
