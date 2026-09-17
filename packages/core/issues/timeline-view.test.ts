import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "../types";
import { buildIssueTimelineRows } from "./timeline-view";

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

function activity(
  id: string,
  createdAt: string,
  action = "status_changed",
): TimelineEntry {
  return {
    type: "activity",
    id,
    actor_type: "member",
    actor_id: "actor-activity",
    action,
    created_at: createdAt,
  } as TimelineEntry;
}

describe("buildIssueTimelineRows", () => {
  it("keeps a late reply at its own global position and preserves the input", () => {
    const root = comment("root", "2026-09-13T10:00:00Z");
    const update = activity("activity", "2026-09-13T10:10:00Z");
    const lateReply = comment("reply", "2026-09-13T10:20:00Z", root.id);
    const input = [lateReply, root, update];

    const rows = buildIssueTimelineRows(input);

    expect(rows.map((row) => row.entry.id)).toEqual([
      "root",
      "activity",
      "reply",
    ]);
    expect(rows[2]).toMatchObject({
      parent: root,
      parentUnavailable: false,
    });
    expect(input.map((entry) => entry.id)).toEqual([
      "reply",
      "root",
      "activity",
    ]);
  });

  it("breaks equal timestamps by id", () => {
    const rows = buildIssueTimelineRows([
      comment("z", "2026-09-13T10:00:00Z"),
      comment("a", "2026-09-13T10:00:00Z"),
    ]);

    expect(rows.map((row) => row.entry.id)).toEqual(["a", "z"]);
  });

  it("coalesces matching adjacent activities but never across a comment", () => {
    const rows = buildIssueTimelineRows([
      activity("a1", "2026-09-13T10:00:00Z"),
      activity("a2", "2026-09-13T10:01:00Z"),
      comment("middle", "2026-09-13T10:01:30Z"),
      activity("a3", "2026-09-13T10:02:00Z"),
    ]);

    expect(rows.map((row) => row.entry.id)).toEqual(["a2", "middle", "a3"]);
    expect(rows[0]?.entry.coalesced_count).toBe(2);
    expect(rows[2]?.entry.coalesced_count).toBeUndefined();
  });

  it("keeps an orphan reply visible with an unavailable parent marker", () => {
    const orphan = comment(
      "orphan",
      "2026-09-13T10:00:00Z",
      "missing-parent",
    );

    expect(buildIssueTimelineRows([orphan])).toEqual([
      {
        entry: orphan,
        parent: null,
        parentUnavailable: true,
      },
    ]);
  });
});
