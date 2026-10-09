# @shizuha/atlas 0.2.1 — release record

This document formalizes the release lineage of `@shizuha/atlas` **0.2.1** for the
deploy-verify close gate (PLAT-1351 v4). The release shipped as a coordinator
direct-primary push on 2026-09-22, so no PR existed at release time; this commit
contains the release record **only** — no code changes.

## Facts

- **Version**: `@shizuha/atlas` 0.2.1 (`package.json` at the release source reads 0.2.1)
- **Released source**: `2c509e8f55ba327e1144a9ef6f1058d11a6c3489` — tagged `v0.2.1`
- **Editor lineage**: 0.2.1 builds on the 0.2.0 editor from `56dc8e7060`
- **Host release gate**: Wiki Origin run 586 / global run 48828 succeeded, deploying
  exact Wiki source `a8e4ad3b76586b6452f00bc9a73a407594768258`
- **DeploymentEvent**: `277fb986-dbab-469d-93ab-965694f34598` (correlated to the
  Wiki/release task keys at release time)
- **Delivery tasks**: PLAT-9737 (program), PLAT-9738 (document engine),
  PLAT-9739 (visual editor), PLAT-9740 (portability), PLAT-9741 (Wiki),
  PLAT-9743 (release verification)

## Live verification (operator receipt, 2026-09-22 UTC)

- 14:57:56.742 — authenticated browser: new-page creation, editing, API read-back,
  saved-page reload, Explore/Zen preview, journeys, named views, undo/redo, a
  concurrent agent PATCH producing a safe HTTP 409 without losing the local draft,
  embedded rendering and mobile checks; zero JavaScript errors.
- 14:58:39.282 — downloaded offline HTML passed editing, export and reopen with zero
  HTTP requests and zero JavaScript errors.
- 14:59:08.052 — browser Back/Forward draft recovery and stale-draft restoration with
  zero JavaScript errors.
- Coordinator inspected actual desktop and embedded screenshots (host-level proof).

## Canonical record

The canonical capability and verification record is the "Atlas design editor 0.2.1"
section of the Shizuha System Atlas wiki page (`b7521dcb-74a8-46e5-ba31-7c22c5dc4cde`,
v6). This file is the git-side lineage formalization requested for the program close;
it asserts no capability beyond that record and defers to it on any disagreement.

## Provenance

Authored by the devops seat (ichi) as bookkeeping formalization routed by engineering
(kai, PLAT-9737 cmt thread). The released code itself was authored and pushed by the
release coordinator; this commit adds documentation only. Review and merge follow the
author ≠ reviewer ≠ merger doctrine.
