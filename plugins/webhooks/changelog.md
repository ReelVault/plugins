# v1.0.1

### Features

- **Parallel delivery** — targets receive their deliveries in parallel, so a slow endpoint no longer holds up the others.
- **Retries for transient failures** — a network error, a 429 or a 5xx answer is retried after 1 second and again after 4 seconds. Any other status is final.
- **Translated settings** — the setting labels and descriptions are available in English and Polish.
