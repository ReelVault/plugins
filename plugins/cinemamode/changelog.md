# v1.3.0

### Fixes

- **Trailer pre-roll frames** — the pre-roll embeds trailers through youtube-nocookie, which the web UI content security policy blocked until the plugin declared the frame source.
- **Manifest versions** — `plugin.json` and `ui.json` declare the same version, and a test fails when they disagree.
