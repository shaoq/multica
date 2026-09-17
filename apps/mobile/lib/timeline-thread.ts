/**
 * Mobile consumes the same canonical persisted timeline model as web/desktop.
 * The UI remains mobile-native, but ordering, coalescing, parent identity, and
 * orphan visibility are shared product semantics.
 */
export {
  buildIssueTimelineRows as buildTimelineRows,
  type IssueTimelineRow as TimelineRow,
} from "@multica/core/issues/timeline-view";
