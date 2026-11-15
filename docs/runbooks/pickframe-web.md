# PickFrame web app and Select app

Covers `pickframe.satuarah.click` (web app) and `select-pickframe.satuarah.click` (offline-first companion). Both are static single-page apps served by Vercel.

## What the monitor checks

A `GET /` that must answer `200` and contain the marker the app shell always has (`id="root"` for the web app, the product name for Select), within the slow limit. A page that loads but is blank would still pass the marker check; the browser suite catches that.

## Is it really down?

```bash
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' https://pickframe.satuarah.click/
curl -sS https://pickframe.satuarah.click/ | grep -c 'id="root"'
```

Check from a phone on mobile data as well. If it works there but not from the runner, suspect routing or a regional issue rather than the deployment.

## Likely causes, most likely first

1. **A bad deployment.** Look at the latest production deployment on Vercel. A failed build leaves the previous one live, but a successful build of broken code does not.
2. **Domain or certificate.** The status error will say `DNS lookup failed` or `TLS certificate problem`. Check the domain's DNS records where they are managed (the apex is registered at Hostinger) and the domain status in the Vercel project.
3. **Platform incident.** Check the Vercel status page.
4. **Rewrite or asset problem.** If `/` works but deep links or scripts fail, see finding QA-005 in the [QA repository](https://github.com/indraaryaLabs/pickframe-qa/blob/main/docs/findings/QA-005.md): missing assets are answered with the app shell.

## Fix

- Bad deployment: use Instant Rollback to the last good production deployment, then fix forward in a branch.
- DNS or certificate: correct the record, then trigger a domain re-verification in the Vercel project.
- Platform incident: nothing to fix; post the status link on the issue and wait.

## Verify

- The service turns green on the [status page](https://indraaryalabs.github.io/satuarah-status/) within two checks.
- Run the [pickframe-qa](https://github.com/indraaryaLabs/pickframe-qa) workflow to confirm the anonymous journeys still pass.

## Afterwards

If a deploy caused it, add the check that would have caught it to the project's CI before closing the issue.
