# v1.3.0

### Features

- **Parallel delivery** — targets receive their deliveries in parallel, so a slow endpoint no longer holds up the others.
- **Retries for transient failures** — a network error, a 429 or a 5xx answer is retried after 1 second and again after 4 seconds. Any other status is final.
