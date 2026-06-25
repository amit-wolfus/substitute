# Substitute — Subtitle-Aware Release Swap

Substitute (stylized **SubsTitute**) monitors Bazarr's wanted list and automatically swaps a release when subtitles exist for a different release than the one currently grabbed.

## How it works

1. Every `POLL_INTERVAL_MINUTES` (default 15 min) Substitute fetches Bazarr's wanted list — items where a file is on disk but the assigned Language Profile flags at least one subtitle as missing.
2. Each new item sits in a `GRACE_MINUTES` (default 10 min) grace period, giving Bazarr's own automatic search time to run first.
3. Items already acted on within `RECHECK_COOLDOWN_HOURS` (default 24 h) are skipped.
4. For each eligible item, Substitute calls Bazarr's manual-search endpoint across all configured subtitle providers. If nothing is found anywhere, it logs once, applies the cooldown, and moves on.
5. If subtitles are found for a *different* release than the one grabbed, Substitute calls Sonarr/Radarr's interactive search, picks the best matching release (exact normalized title match, `approved` flag, ranked by score → seeders → age), and grabs it. The \*arr replaces the file on import automatically — no manual import step needed.

`DRY_RUN=true` (the default) logs what Substitute *would* do without touching Sonarr/Radarr state. Review a few days of dry-run output before flipping to `false`.

## Quick start

1. Copy `.env.example` to `.env` and fill in your API keys.
2. Build the image:

```bash
docker build -t substitute .
```

3. Run it:

```bash
docker run -d \
  --name substitute \
  --env-file .env \
  -v substitute-state:/data \
  substitute
```

4. Follow logs to verify the first poll:

```bash
docker logs -f substitute
```

**Docker Compose users:** add a service block pointing at this directory and mount a named volume at `/data`. Pass the env vars from your `.env` file.

## Secrets

| Variable | Source |
|---|---|
| `BAZARR_API_KEY` | Bazarr → Settings → General → Security |
| `RADARR_API_KEY` | Radarr → Settings → General → Security |
| `SONARR_API_KEY` | Sonarr → Settings → General → Security |

`BAZARR_URL`, `RADARR_URL`, and `SONARR_URL` default to Docker service names (`http://bazarr:6767`, `http://radarr:7878`, `http://sonarr:8989`). Override them if your setup uses different hostnames or ports.

## Configuration knobs

| Variable | Default | Effect |
|---|---|---|
| `POLL_INTERVAL_MINUTES` | `15` | Polling interval in minutes |
| `GRACE_MINUTES` | `10` | Grace period before Substitute acts on a new item |
| `RECHECK_COOLDOWN_HOURS` | `24` | Minimum gap between re-checking the same item |
| `DRY_RUN` | `true` | Any value other than `false` is treated as `true` — logs intended actions without executing them |
| `LANGUAGE_ALLOWLIST` | *(empty)* | Comma-separated BCP-47 codes (e.g. `fr,de`) to act on; empty = act on all languages the item's Bazarr Language Profile flags as missing |
| `STATE_PATH` | `/data/state.json` | Path to the persistent state file (mount a volume here to survive restarts) |

## Operations

```bash
# Follow logs
docker logs -f substitute

# Restart (e.g. after editing .env)
docker restart substitute

# Rebuild after code changes
docker build -t substitute . && docker restart substitute

# Stop completely
docker stop substitute

# Clear state (resets all first-seen timestamps and cooldowns)
docker exec substitute rm /data/state.json
docker restart substitute
```
