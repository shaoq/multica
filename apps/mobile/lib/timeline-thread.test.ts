import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@multica/core/types";
import { buildTimelineRows } from "./timeline-thread";

function comment(
  id: string,
  createdAt: string,
  parentId: string | null = null,
): TimelineEntry {
  return {
    type: "comment",
    id,
    actor_type: "member",
    actor_id: `actor-${id}`,
    actor_name: `Author ${id}`,
    content: `Body ${id}`,
    parent_id: parentId,
    created_at: createdAt,
    updated_at: createdAt,
    comment_type: "comment",
  } as TimelineEntry;
}

describe("buildTimelineRows", () => {
  it("uses the shared flat chronology and direct parent context", () => {
    const root = comment("root", "2026-09-13T10:00:00Z");
    const newerRoot = comment("newer-root", "2026-09-13T10:10:00Z");
    const lateReply = comment("late-reply", "2026-09-13T10:20:00Z", root.id);

    const rows = buildTimelineRows([lateReply, newerRoot, root]);

    expect(rows.map((row) => row.entry.id)).toEqual([
      "root",
      "newer-root",
      "late-reply",
    ]);
    expect(rows[2]).toMatchObject({
      parent: root,
      parentUnavailable: false,
    });
  });
});
