# TODO

## PR Detail Page Actions

### Approve Button
- [ ] Add "Approve" button on detail page
- [ ] Pre-flight checks before approving (CI passing, no conflicts, no unresolved findings)
- [ ] Show check results in a confirmation dialog before proceeding
- [ ] Post `APPROVE` review via `gh api repos/tinyhumansai/openhuman/pulls/<N>/reviews`
- [ ] Log the action with timestamp
- [ ] Update tracking file status to `clean` and move to `to-be-approved/`
- [ ] Show live output of the approval process

### Merge Button
- [ ] Add "Merge" button on detail page
- [ ] Pre-flight checks before merging (CI passing, mergeable, approved, no conflicts)
- [ ] Show check results in a confirmation dialog — block if any fail
- [ ] Merge via `gh pr merge <N> --repo tinyhumansai/openhuman --squash` (or `--merge`)
- [ ] Log the action with timestamp
- [ ] Show live output of the merge process
- [ ] Update PR status in DB after merge

### Refresh Button
- [ ] Add "Refresh" button on detail page
- [ ] Re-fetches PR data from GitHub API (metadata + CI checks + merge status)
- [ ] Re-syncs tracking file from disk
- [ ] Re-renders the page with fresh data
- [ ] Shows a brief loading indicator while refreshing

## Smart Re-review & Comment Resolution

- [ ] On re-trigger (or new review cycle), detect older review comments from `graycyrus`
- [ ] Check if the PR author has pushed new commits since those comments
- [ ] Check if the author replied to or addressed specific comments
- [ ] For each inline comment: determine if the requested change was fulfilled in subsequent commits
- [ ] If fulfilled → reply acknowledging the fix and resolve the comment thread
- [ ] If `REQUEST_CHANGES` review exists and all requested changes are addressed → post a new review dismissing/closing the previous request
- [ ] If author made a generic comment (not addressing specifics) → evaluate whether the concern was still resolved via code changes
- [ ] Log all resolution actions in the tracking file review history

## Individual PR Sync Button

- [ ] Add "Sync" button on each PR card/row in the dashboard list view
- [ ] On click, re-fetch that single PR's data from GitHub API (metadata, CI, merge status, comments)
- [ ] Re-parse the tracking `.md` file from disk
- [ ] Upsert into DB and re-render just that PR's row/card
- [ ] Show loading indicator on the individual PR during sync

## PR Change Summary in Review Cycle

- [ ] During each review cycle, generate a summarized description of the PR's changes
- [ ] Store the summary in the `review_cycles` table (new `summary` column)
- [ ] Also persist the summary in the tracking `.md` file under each review cycle entry
- [ ] Display the summary on the PR detail page for each review cycle
- [ ] Summary should cover: what files changed, what the PR does, key modifications
