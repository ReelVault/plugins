# Notify Webhook (`org.reelvault.notify-webhook`)

Sends every in-app notification to a JSON webhook endpoint. Use it to forward new episodes, media requests and plugin alerts to your own service.

## Setup

1. Get the URL of an endpoint that accepts JSON `POST` requests.
2. In ReelVault, open **Admin → Plugins**, open **Notify Webhook** and paste the URL into **Webhook URL**.
3. Optional: set **Authorization header**, for example `Bearer <your-token>`.
4. Choose what to send, then save.

Each notification is sent as one `POST`. If an endpoint does not answer within 15 seconds, ReelVault skips it and writes a log entry. The other channels still deliver.

## Configuration

| Field | Default | What it does |
|---|---|---|
| `webhookUrl` | empty | The endpoint. Every notification is `POST`ed as JSON to this URL |
| `authorizationHeader` | empty | Sent as the `Authorization` header, if set |
| `notifyNewEpisodes` | on | Send new-episode notifications |
| `notifySystem` | on | Send everything else: system and plugin notifications |

## Links

- [Plugins overview](../../README.md)
- [Installing plugins](https://reelvault.org/guide/plugins) in the ReelVault docs
