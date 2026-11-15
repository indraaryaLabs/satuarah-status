# Portfolio

Covers `indraarya.satuarah.click`, a static site.

## What the monitor checks

`GET /` must answer `200` and contain `Indra Arya`, within 2 seconds.

## Is it really down?

```bash
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' https://indraarya.satuarah.click/
```

## Likely causes

1. A bad deployment: check the latest production deployment and roll back.
2. Domain or certificate: the status error says `DNS lookup failed` or names a certificate problem. Check the DNS record and the domain status in the hosting project.
3. A platform incident: check the host's status page.

## Fix and verify

Roll back or correct the record, then confirm green on the status page. This site is visited by people evaluating the work behind it, so check it in a private window on a phone as well.
