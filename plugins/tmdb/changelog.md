# v1.0.3

### Features

- **Translated settings** — the setting labels and descriptions are available in English and Polish.

### Fixes

- **Fallback language** — the fallback language is used for every request. It used to be dropped when it matched the configured language, which silently disabled it for requests in another language.
- **Search fallback** — when a search finds nothing in the requested language, the fallback language is searched too, so titles that only exist in the fallback language can be found.
