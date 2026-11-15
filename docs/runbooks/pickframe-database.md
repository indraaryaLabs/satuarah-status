# PickFrame database path

PickFrame stores its data in Supabase Postgres. This check exercises the database without logging in.

## What the monitor checks

`GET /api/p/status-probe-unknown-link`, a client gallery lookup for a link that cannot exist. A healthy system answers `404` with a body containing `not found`, because the API had to query the database to learn the link does not exist. Any `5xx`, a timeout or a different body means the lookup could not complete.

It runs every 15 minutes. Failed lookups are rate-limited per client (20 per 10 minutes), and one probe per 15 minutes stays far below that.

## Is it really down?

```bash
curl -sS -w '\n%{http_code}\n' https://api-pickframe.satuarah.click/api/p/status-probe-unknown-link
```

Healthy: `404` and a JSON error mentioning `not found`. If the API health check is also failing, start with the [API runbook](pickframe-api.md).

## Likely causes, most likely first

1. **The project is paused.** Free Supabase projects pause after a week without activity. The status page shows the database path failing while the API health check passes. This probe's own traffic counts as activity, but do not rely on that.
2. **The project is unhealthy or restarting.** Check the project status in the Supabase dashboard and its logs.
3. **Connection limits.** Too many open connections from serverless functions. Look for connection errors in the API function logs.
4. **Changed credentials.** A rotated password or key that the API environment still has the old value of.
5. **Platform incident.** Check the Supabase status page.

## Fix

- Paused: restore the project from the dashboard and wait until it reports healthy.
- Connection limits: use the pooled connection string in the API environment and redeploy.
- Credentials: update the environment variable in the API project and redeploy.

## Verify

- The service is green on the status page after the next check (up to 15 minutes; run the Probe workflow manually to speed this up).
- Sign in to the web app and open a project, which exercises authenticated reads.

## Afterwards

If the project was paused, decide whether to keep it on the free plan with a deliberate keep-alive or to move it to a paid plan, and write the decision in an ADR.
