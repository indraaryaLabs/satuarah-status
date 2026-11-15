# Postmortem: <short title>

- Incident issue: #
- Date: YYYY-MM-DD
- Duration: start to end, with time zone
- Services:
- Severity: outage or degraded
- Author:

Blameless. Describe what the system and the process did, not what a person should have done.

## Summary

Two or three sentences: what was affected, for how long, and how it ended.

## Impact

Who could not do what. Use numbers from the status page (failed checks, minutes) and, if known, from the product.

## Timeline

Times in one time zone. Include when the monitor saw it, when it was noticed by a person, and each action.

| Time | Event                                   |
| ---- | --------------------------------------- |
|      | Monitor recorded the first failed check |
|      | Incident issue opened                   |
|      |                                         |
|      | Recovered                               |

## Root cause

The chain of causes, from the trigger to the user-visible effect. Stop at something that can be changed.

## What went well

## What went badly

## Where we got lucky

## Actions

| Action | Type                        | Owner | Due | Done |
| ------ | --------------------------- | ----- | --- | ---- |
|        | prevent, detect or mitigate |       |     |      |

## Detection check

Did the monitor catch this on its own, and how quickly? If not, what check would have?
