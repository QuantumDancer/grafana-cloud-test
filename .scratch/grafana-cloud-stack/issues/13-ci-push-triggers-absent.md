# Push-triggered CI runs mysteriously absent (2026-08-06)

Status: wontfix

Pushes `4da98b5` (touches `apps/frontend/**`, matches the workflow's path filter) and
`0fc82b7` produced PushEvents on GitHub but *zero* workflow runs
(`actions/runs?head_sha=` returned 0; all three workflows `state=active`; earlier
same-day pushes triggered fine). Strong circumstantial cause: a GitHub Actions incident
that evening (dispatched runs were also queue-stuck 15+ min before being cancelled).

Workaround that worked: `gh workflow run frontend.yml` / `backend.yml` (manual dispatch).

needs-info because it is only diagnosable on recurrence. If it recurs:

- Compare the pushing credential/actor with earlier successful pushes.
- Check https://www.githubstatus.com/ for Actions delays before debugging the repo.
- Fall back to manual dispatch to unblock.

Close as external/incident if the next several path-matching pushes trigger normally.

## Comments

2026-08-07 (agent): Closed as external. User confirms a GitHub Actions outage yesterday
evening, since resolved; today's push `b937ad8` (path-matching via `43114dd`) triggered
run 31156547218 immediately and it succeeded. Nothing to fix in this repo — the
workaround note above stands if an incident ever recurs.
