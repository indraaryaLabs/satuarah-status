# Runbooks

One page per service, written for someone who just received an incident issue and needs to act. Each one answers: is it really down, what is the likely cause, how do I fix or contain it, and how do I know it is fixed.

| Runbook                                              | When                                           |
| ---------------------------------------------------- | ---------------------------------------------- |
| [PickFrame web app and Select app](pickframe-web.md) | The website or the companion app does not load |
| [PickFrame API](pickframe-api.md)                    | The API health check fails or is slow          |
| [PickFrame database path](pickframe-database.md)     | The client link lookup returns a server error  |
| [Portfolio](portfolio.md)                            | The portfolio site does not load               |
| [Monitor pipeline](monitor-pipeline.md)              | The status page is stale, empty or wrong       |

Incident habit, in order: confirm from a second place, post what you know on the issue, contain, fix, verify on the status page, then write a [postmortem](../postmortem-template.md) if the incident lasted more than an hour or touched customers.

Commands below assume a shell with `curl`. Replace nothing; all addresses are public.
