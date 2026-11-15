# ADR 0003: The page is static and reads one JSON file

- Status: accepted
- Date: 2026-11-15

## Context

The page could be rebuilt and redeployed with fresh data on every run, or it could fetch data at view time.

## Decision

Deploy the page only when its code changes, to GitHub Pages. At view time it fetches `status.json` from `raw.githubusercontent.com`, which serves public files with permissive CORS headers. A per-minute query string keeps the CDN from serving data older than a minute past its own five minute cache.

## Consequences

- Deploying the page and updating the data are independent. A data run never touches Pages.
- The page validates the document shape before rendering and shows an error state otherwise. Text from the data is always inserted as text, never as markup.
- The page depends on one third-party host. If it is unreachable the page says so and does not claim the services are down.
- A custom domain such as `status.satuarah.click` can be added later by pointing a DNS record at GitHub Pages. No code changes are needed.
