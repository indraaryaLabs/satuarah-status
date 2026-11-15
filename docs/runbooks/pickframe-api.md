# PickFrame API

Covers `api-pickframe.satuarah.click`, a Go service running as Vercel serverless functions.

## What the monitor checks

A `GET /` that must answer `200` with a body containing `"status":"ok"`, within 3 seconds. This proves the function starts and routes. It does not prove sign-in or the database work; the [database path](pickframe-database.md) check covers the database.

## Is it really down?

```bash
curl -sS -w '\n%{http_code} %{time_total}s\n' https://api-pickframe.satuarah.click/
```

Expected body: `{"status":"ok","service":"pickframe-api"}`.

A first request after a quiet period can take a second or two (cold start). A slow status that clears on the next check is a cold start, not an incident.

## Likely causes, most likely first

1. **A bad deployment.** Compare the incident start time with the latest production deployment of the API project.
2. **A function error.** Open the function logs for the time of the first failure. A panic at startup, for example a missing environment variable, fails every request.
3. **Platform incident.** Check the Vercel status page.
4. **Dependency failure.** If health is fine but the product misbehaves, go to the [database runbook](pickframe-database.md).
5. **Blocked browser calls only.** If `curl` works but the web app cannot call the API, the cause is the CORS allow-list. The [QA suite](https://github.com/indraaryaLabs/pickframe-qa) checks it daily.

## Fix

- Bad deployment: roll back, then fix forward.
- Missing or wrong environment variable: correct it in the project settings and redeploy, since changes apply only to new deployments.
- Platform incident: wait, and keep the issue updated.

## Verify

- Green on the status page within two checks.
- `curl` returns the expected body.
- Run the QA workflow; its API suite covers health, authentication and CORS.

## Notes

- Do not test authentication by sending real tokens to the public endpoint from a shared shell. The QA suite uses forged tokens on purpose and expects them to be rejected.
