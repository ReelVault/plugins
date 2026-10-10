# v1.3.0

### Features

- **Missing trailers remembered** — a title whose lookup finds no trailer is remembered for 24 hours, so TMDB is not searched again on every request. Found trailers are stored as before.
- **"Cache all" removed** — the "Cache all trailers" button and its route are removed. They did nothing without a list of titles, and downloading every trailer is not worth the space.

### Fixes

- **Outbound requests** — TMDB requests go through the host's HTTP client, so the outbound domain allowlist and the SSRF guard apply to them.
- **Statistics** — cached-trailer counts per media type are updated on every write instead of being recalculated from every cached record on each request. Existing data is counted once, when the counts are first missing.
- **README** — describes the 24-hour negative cache, the routes and the outbound HTTP path. It used to describe a scheduled pre-fetch that does not exist.
- **Manifest versions** — `plugin.json` and `ui.json` declare the same version, and a test fails when they disagree.
