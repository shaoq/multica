# Global Chronological Issue Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every persisted issue timeline entry render in deterministic global chronological order across Web, Desktop, iOS, and Android while preserving direct reply context.

**Architecture:** A pure helper in `packages/core` owns sorting, adjacent activity coalescing, and parent-context resolution. Web/Desktop and Mobile consume that model directly; platform components only choose layout and navigation. Agent execution UI remains auxiliary until a persisted result comment exists, and resolved state never performs automatic thread folding.

**Tech Stack:** TypeScript, React, React Native/Expo, TanStack Query, React Virtuoso, FlashList, Vitest.

**Spec:** `openspec/changes/global-chronological-issue-timeline/design.md`

## Global Constraints

- React Query owns server timeline state; Zustand stores no server-entry copies.
- Canonical order is `(created_at ASC, id ASC)` for persisted `TimelineEntry` values.
- Web/Desktop share `packages/views`; Mobile imports only pure `packages/core` logic and owns its UI.
- No server schema, database, or API response changes.
- Production behavior is changed only after the corresponding regression test fails for the expected reason.

---

### Task 1: Shared chronological presentation model

**Files:**
- Create: `packages/core/issues/timeline-view.ts`
- Create: `packages/core/issues/timeline-view.test.ts`
- Modify: `packages/core/package.json`

**Interfaces:**
- Consumes: `TimelineEntry[]` and `sortTimelineEntriesAsc`.
- Produces: `buildIssueTimelineRows(entries): IssueTimelineRow[]`, where each row contains `entry`, `parent`, and `parentUnavailable`.

- [ ] Write literal fixtures proving late replies remain late, timestamp ties use IDs, activities only coalesce while adjacent, and missing parents preserve replies.
- [ ] Run `pnpm --filter @multica/core test -- timeline-view.test.ts` and confirm the missing module/function causes RED.
- [ ] Implement the pure model without mutating its input and export it from `packages/core/package.json`.
- [ ] Re-run the focused test and `pnpm --filter @multica/core typecheck`; require exit 0.

### Task 2: Web/Desktop flat timeline

**Files:**
- Modify: `packages/views/issues/components/issue-detail.test.tsx`
- Modify: `packages/views/issues/components/issue-detail.tsx`
- Modify: `packages/views/issues/components/comment-card.tsx`
- Modify: `packages/views/locales/{en,zh-Hans,ja,ko}/issues.json`

**Interfaces:**
- Consumes: `buildIssueTimelineRows` and current `buildCommentRunView` run associations.
- Produces: one `TimelineItem` per persisted comment, parent-reference navigation, and run metadata indexed by result/anchor comment.

- [ ] Add a DOM-order test for `root → activity → late reply`, a direct-parent reference test, and a resolved-body-visible test.
- [ ] Run the focused IssueDetail tests and confirm they fail against nested replies/resolved bars.
- [ ] Replace thread-root grouping with the shared row model; keep only adjacent activity presentation grouping.
- [ ] Index persisted-result run metadata by result comment ID, keep unpersisted run blocks auxiliary, and never consume projected `parent_id` for canonical rows.
- [ ] Add the compact parent reference and exact missing-parent fallback to `CommentCard`.
- [ ] Make deep links, post-submit scroll, minimap, find, and image order consume independent row IDs.
- [ ] Remove automatic resolved bars/folds from the IssueDetail path while retaining ordinary per-comment manual collapse.
- [ ] Run focused views tests and `pnpm --filter @multica/views typecheck`; require exit 0.

### Task 3: Mobile flat timeline

**Files:**
- Modify: `apps/mobile/lib/timeline-thread.ts`
- Create: `apps/mobile/lib/timeline-thread.test.ts`
- Modify: `apps/mobile/lib/timeline-coalesce.ts`
- Modify: `apps/mobile/components/issue/timeline-list.tsx`
- Modify: `apps/mobile/components/issue/comment-card.tsx`

**Interfaces:**
- Consumes: the shared `buildIssueTimelineRows` contract.
- Produces: one FlashList row per canonical entry, `parent` context, direct parent navigation, and resolved rows that remain expanded.

- [ ] Add mobile fixtures proving exact row IDs and parent resolution, then run the focused test to observe RED.
- [ ] Replace descendant bundling and duplicated coalescing with the shared core helper.
- [ ] Render one comment bubble per row and add a narrow-screen parent reference with unavailable fallback.
- [ ] Compute image order, divider anchors, deep-link highlight, and parent jumps from flat rows.
- [ ] Remove resolved-thread automatic collapse and retain a visible per-row resolved indicator.
- [ ] Run Mobile tests and typecheck; require exit 0.

### Task 4: Cross-surface verification and proposal closure

**Files:**
- Modify: `openspec/changes/global-chronological-issue-timeline/tasks.md`

**Interfaces:**
- Consumes: all implementation and test evidence.
- Produces: verified task state and final impact report.

- [ ] Run focused core/views/mobile tests, package typechecks, and the server timeline tests.
- [ ] Run `openspec validate global-chronological-issue-timeline --type change --strict --json` and require zero issues.
- [ ] Run GitNexus changed-symbol analysis; if unavailable, record the failure and corroborate every changed symbol with source callers.
- [ ] Review `git diff --check`, `git diff --stat`, and working-tree status without touching unrelated user changes.
