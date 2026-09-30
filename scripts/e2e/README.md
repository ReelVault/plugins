# ReelVault plugins — E2E test harness

Full end-to-end test suite for all 8 official plugins, run against an isolated
ReelVault instance (port **4660**, data in `/tmp/rv-plugins-e2e/data`, web dist
built fresh from `../website`).

## Requirements

- Bun 1.4+, ffmpeg on PATH, Google Chrome at `/usr/sbin/google-chrome-stable`
  (UI suite), network access (TMDB/OMDb/postman-echo/official plugin catalog).
- API keys: `E2E_TMDB_KEY` and `E2E_OMDB_KEY` env vars, or a
  `/tmp/rv-plugins-e2e/keys.json` file (`{"tmdbApiKey": "...", "omdbApiKey": "..."}`).
  Without them the provider suites SKIP their real-API cases (everything else runs).

## Run

```bash
cd plugins
bun run scripts/e2e/run-all.sh            # full A-Z: builds + server + all suites
bun run scripts/e2e/run-all.sh --skip-build   # reuse existing website/dist
```

`run-all.sh` starts a supervisor (`supervisor.ts`, long-lived process owning the
server) and tears it down at the end. Suites can also be run individually —
start the supervisor first (`bun run scripts/e2e/supervisor.ts`) and run
`00-bootstrap.ts` once:

```bash
bun run scripts/e2e/supervisor.ts &        # stays running, owns the server
bun run scripts/e2e/00-bootstrap.ts        # idempotent setup
bun run scripts/e2e/12-media-requests.ts   # any single suite
```

## Suites

| Suite | Covers |
| --- | --- |
| `00-bootstrap` | server start, first-run setup, accounts, install of all 8 plugin zips, config (TMDB/OMDb/trailers/cinemamode), test media (ffmpeg), libraries, TMDB-matched scan |
| `10-tmdb` / `11-omdb` | provider registration, real search/identify by external id, contract errors, broken-key graceful degradation |
| `12-media-requests` | discover/search/genres/details/seasons, request CRUD + per-user limits, admin approval flow, coming-soon, **auto-fulfilment via `media.file.ready`**, notifications, ownership rules |
| `13-cinemamode` | pre-roll endpoint (real TMDB recommendations ∩ library), 400s, admin preview, enable toggle with secret preservation |
| `14-community-markers` | segment CRUD + validation, race-lock, vote approve/reject thresholds, native `media_markers` sync, voter-privacy projection, admin routes |
| `15-trailers` | trailer lookup by metadataId/tmdbId/title, stats, admin cache-all, role checks |
| `16-webhooks` | real delivery to a public echo endpoint, SSRF-blocked deliveries recorded as failures, broken Discord creds degrade cleanly, history |
| `17-bug-reports` | report CRUD, per-user visibility, filters, admin status workflow, per-user limits, notifications, delete permissions |
| `20-install-abuse` | hostile uploads: garbage, empty, RAR-magic, traversal, zip bomb, truncated, manifest-less, bad id, duplicate upgrade, uninstall/reinstall |
| `21-config-abuse` | range/pattern validation, unknown-field stripping, secret redaction, roundtrip, role checks |
| `22-routes-abuse` | auth on plugin routes, 404s, wrong methods, encoded traversal scoping, oversized bodies, injection probes, 300/min rate limit |
| `23-upgrade-catalog` | catalog listing + install status, config preservation across upgrade, catalog install after uninstall, unknown id rejection |
| `30-roles-realtime` | adminOnly surfaces filtered from user UI manifest, realtime `requests.changed` over WS, fan-out payload leak check |
| `40-restart-persistence` | server restart → all plugins/config/storage/routes restored |
| `41-reload-under-load` | reload-all under traffic (no 5xx), disable/enable cycle, UI manifest updates |
| `50-ui` | Playwright (Chrome headless): admin plugins/installed/catalog/config pages, revision-history dialog, dashboard coming-soon widget, discover page, bug-report overlay, details trailer action, realtime propagation into Shadow DOM without reload |

Results land in `/tmp/rv-plugins-e2e/reports/` (`summary.jsonl`, per-suite JSON,
UI screenshots in `reports/ui/`). Every suite prints PASS/FAIL per case and
exits non-zero on failure; `run-all.sh` fails if any suite crashes or any case fails.

## Notes

- Test accounts: `admin-e2e@`, `user-a-e2e@`, `user-b-e2e@reelvault.local`
  (passwords in `lib/state.ts`). Bootstrap enables `auth.allowRegistration`.
- The harness caches session cookies in `/tmp/rv-plugins-e2e/state.json`;
  re-login happens automatically on 401.
- Install/upload endpoints are rate-limited by the server (10/min, catalog 5/min,
  auth endpoints 5/min) — the suites retry on 429 where a wait is expected.
