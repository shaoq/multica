import type { TimelineEntry } from "../types";
import { sortTimelineEntriesAsc } from "./timeline-sort";

const COALESCE_WINDOW_MS = 2 * 60 * 1000;
const UNBOUNDED_ACTIVITY_ACTIONS = new Set(["task_completed", "task_failed"]);
const NEVER_COALESCE_ACTIVITY_ACTIONS = new Set(["squad_leader_evaluated"]);

export interface IssueTimelineRow {
  entry: TimelineEntry;
  /** The persisted direct parent from the same authorized timeline response. */
  parent: TimelineEntry | null;
  /** True only when parent_id exists but its comment is absent from the response. */
  parentUnavailable: boolean;
}

function canCoalesceActivity(
  previous: TimelineEntry | undefined,
  current: TimelineEntry,
): boolean {
  if (previous?.type !== "activity" || current.type !== "activity") return false;
  if (NEVER_COALESCE_ACTIVITY_ACTIONS.has(current.action ?? "")) return false;
  if (
    previous.action !== current.action ||
    previous.actor_type !== current.actor_type ||
    previous.actor_id !== current.actor_id
  ) {
    return false;
  }
  if (UNBOUNDED_ACTIVITY_ACTIONS.has(current.action ?? "")) return true;
  return (
    Math.abs(
      new Date(current.created_at).getTime() -
        new Date(previous.created_at).getTime(),
    ) <= COALESCE_WINDOW_MS
  );
}

/**
 * Builds the canonical client-side presentation sequence for an issue.
 *
 * The returned rows contain persisted TimelineEntry values only. Ephemeral
 * Agent run state is deliberately outside this contract. The input is cloned
 * before sorting so React Query cache arrays are never mutated by a view.
 */
export function buildIssueTimelineRows(
  entries: readonly TimelineEntry[],
): IssueTimelineRow[] {
  const sorted = sortTimelineEntriesAsc([...entries]);
  const commentsById = new Map(
    sorted
      .filter((entry) => entry.type === "comment")
      .map((entry) => [entry.id, entry] as const),
  );
  const visible: TimelineEntry[] = [];

  for (const entry of sorted) {
    const previous = visible[visible.length - 1];
    if (canCoalesceActivity(previous, entry)) {
      visible[visible.length - 1] = {
        ...entry,
        coalesced_count: (previous?.coalesced_count ?? 1) + 1,
      };
      continue;
    }
    visible.push(entry);
  }

  return visible.map((entry) => {
    if (entry.type !== "comment" || !entry.parent_id) {
      return { entry, parent: null, parentUnavailable: false };
    }
    const parent = commentsById.get(entry.parent_id) ?? null;
    return { entry, parent, parentUnavailable: parent === null };
  });
}
