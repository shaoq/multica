/**
 * One persisted comment row in the globally chronological timeline. Replies
 * remain independent bubbles and carry a compact, tappable direct-parent
 * reference so chronology and conversation context are both visible.
 *
 * Mobile flat-list rule (apps/mobile/CLAUDE.md): the persisted row sequence
 * matches web/desktop; mobile uses one touch-friendly bubble per row.
 *
 * Interaction: long-press inside a bubble fires a native iOS
 * `ActionSheetIOS` with the comment's actions (Reply, React…, Copy,
 * Select Text, Copy Link, Resolve, Delete). While the sheet is on screen
 * the targeted bubble's border highlights. See `useCommentLongPress` in
 * `./comment-context-menu.tsx`.
 *
 * Resolution is row metadata, not a visibility rule: resolved content remains
 * readable and receives only a light visual treatment.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import type { Reaction, TimelineEntry } from "@multica/core/types";
import { isDeletedComment } from "@multica/core/issues/comment-deletion";
import { Text } from "@/components/ui/text";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { useActorLookup } from "@/data/use-actor-name";
import { timeAgo } from "@/lib/time-ago";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Markdown } from "@/lib/markdown";
import { CommentAttachmentList } from "@/components/issue/comment-attachment-list";
import {
  discardFailedComment,
  useCreateComment,
  useToggleCommentReaction,
} from "@/data/mutations/issues";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { issueAttachmentsOptions } from "@/data/queries/issues";
import { useFailedCommentsStore } from "@/data/stores/failed-comments-store";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ReactionBar } from "./reaction-bar";
import { useCommentLongPress } from "./comment-context-menu";
import { useCommentSelectStore } from "@/data/comment-select-store";
import { stripMarkdown } from "@/lib/strip-markdown";

interface Props {
  entry: TimelineEntry;
  parentEntry?: TimelineEntry | null;
  parentUnavailable?: boolean;
  onNavigateToParent?: (commentId: string) => void;
  /** Plumbed through so each CommentBody can wire its reaction toggle to
   *  the correct issue's mutation key. */
  issueId: string;
  /** Human-readable identifier (e.g. `MUL-123`) used to build the shareable
   *  web URL for the long-press "Copy Link" item. Optional — that item
   *  hides when missing. */
  issueIdentifier: string | undefined;
  /** Inbox deep-link flash target for this independent row. */
  highlightedCommentId?: string | null;
}

export function CommentCard({
  entry,
  parentEntry,
  parentUnavailable = false,
  onNavigateToParent,
  issueId,
  issueIdentifier,
  highlightedCommentId,
}: Props) {
  const resolved = !!entry.resolved_at;
  // Highlight ring while a long-press action sheet is on screen — child
  // CommentBody flips this via onPressChange so the outer bubble shell can
  // visually bind the sheet to the targeted entry.
  const [pressedEntryId, setPressedEntryId] = useState<string | null>(null);
  const handlePressChange = useCallback((entryId: string, pressed: boolean) => {
    setPressedEntryId((cur) => {
      if (pressed) return entryId;
      return cur === entryId ? null : cur;
    });
  }, []);
  const isHighlighted = pressedEntryId === entry.id;
  // Translucent primary-tinted background while ANY body inside this card
  // is in text-selection mode. Subtle visual cue that replaces the prior
  // Done pill — exit is via scroll / tab switch / selecting another body.
  const selectingId = useCommentSelectStore((s) => s.selectingId);
  const isSelectingHere = selectingId === entry.id;

  // A deleted comment renders nothing in the flat timeline: the server keeps
  // its row only as a tombstone so its replies keep a direct parent (#8296),
  // and every reply renders flat where it was. Kept after all hooks so a row
  // transitioning to deleted mid-flight does not change the hook count.
  if (isDeletedComment(entry)) return null;

  return (
    <View className="px-4">
      <View className="rounded-2xl">
        {/* Bubble uses `surface-1` (L 98%) — extremely subtle elevation
         *  above the page, visible mostly through the rounded edge rather
         *  than the fill (iOS settings cell feel; see Refactoring UI #4
         *  "cards subtle from page"). Internal markdown elements (table
         *  headers / code blocks via markdown-style.ts) use `surface-2`
         *  (L 90%), 8% darker than the bubble — well over the 5%
         *  perceptibility threshold so the inner box is clearly framed.
         *  Border (L 84%) adds 6% on top for the outline. See global.css
         *  for the full 5-tier elevation scale.
         *
         *  Resolved rows use a light muted fill while preserving normal text
         *  contrast and the full readable body. */}
        <View
          className={cn(
            "bg-surface-1 rounded-2xl px-4 py-3 gap-3 border-2 border-transparent transition-colors",
            resolved && "bg-muted/30",
            isHighlighted && "border-primary/30",
            isSelectingHere && "bg-primary/5 border-primary/30",
          )}
        >
          {resolved ? <ResolvedIndicator entry={entry} /> : null}
          {entry.parent_id && parentEntry ? (
            <ParentReference
              entry={parentEntry}
              onPress={() => onNavigateToParent?.(parentEntry.id)}
            />
          ) : null}
          {entry.parent_id && !parentEntry && parentUnavailable ? (
            <View className="rounded-lg border border-dashed border-border/60 px-3 py-2">
              <Text className="text-xs text-muted-foreground">
                Original comment unavailable
              </Text>
            </View>
          ) : null}
          <CommentBody
            entry={entry}
            issueId={issueId}
            issueIdentifier={issueIdentifier}
            onPressChange={handlePressChange}
          />
        </View>
        <RootHighlightOverlay active={highlightedCommentId === entry.id} />
      </View>
    </View>
  );
}

function ParentReference({
  entry,
  onPress,
}: {
  entry: TimelineEntry;
  onPress: () => void;
}) {
  const { getName } = useActorLookup();
  const { colorScheme } = useColorScheme();
  const mutedFg = THEME[colorScheme].mutedForeground;
  const author =
    entry.actor_name ||
    getName(
      entry.actor_type as "member" | "agent" | null | undefined,
      entry.actor_id,
    );
  const preview = stripMarkdown(entry.content ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <Pressable
      onPress={onPress}
      className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={`Replying to ${author}. ${timeAgo(entry.created_at)}. ${preview}`}
    >
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="return-up-back" size={13} color={mutedFg} />
        <Text className="text-xs font-medium text-foreground" numberOfLines={1}>
          Replying to {author}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {timeAgo(entry.created_at)}
        </Text>
      </View>
      {preview ? (
        <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={2}>
          {preview}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ResolvedIndicator({ entry }: { entry: TimelineEntry }) {
  const { getName } = useActorLookup();
  const { colorScheme } = useColorScheme();
  const mutedFg = THEME[colorScheme].mutedForeground;
  const resolverName = getName(
    entry.resolved_by_type as "member" | "agent" | null | undefined,
    entry.resolved_by_id,
  );

  return (
    <View
      className="flex-row items-center gap-2"
      accessibilityRole="text"
      accessibilityLabel={`Resolved by ${resolverName}`}
    >
      <Ionicons name="checkmark-circle" size={14} color={mutedFg} />
      <Text className="text-xs text-muted-foreground flex-1" numberOfLines={1}>
        Resolved by{" "}
        <Text className="text-xs text-foreground font-medium">
          {resolverName}
        </Text>
        {entry.resolved_at ? ` · ${timeAgo(entry.resolved_at)}` : ""}
      </Text>
    </View>
  );
}

/**
 * Animated highlight overlay for a root comment bubble. Sits absolute-
 * positioned over the parent <View className="rounded-2xl">, no pointer
 * capture (long-press still works through it). Border + background wash
 * — equivalent to web's `ring-2 ring-brand/50 bg-brand/5`.
 *
 * Reflow note: animating `borderWidth` would push children every frame,
 * so we keep it constant at 2 and animate `opacity` 0→1→0. Same trick
 * for the wash. Single shared value, one animated style.
 */
function RootHighlightOverlay({ active }: { active: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    // 700ms fade-in → 1800ms hold → 700ms fade-out. Matches web's
    // `transition-colors duration-700` + `setTimeout(2500)` timing.
    progress.value = withSequence(
      withTiming(1, { duration: 700 }),
      withDelay(1800, withTiming(0, { duration: 700 })),
    );
  }, [active, progress]);

  const style = useAnimatedStyle(() => ({ opacity: progress.value }));

  // Brand colour comes from the `brand` token; alpha via NativeWind `/50`
  // syntax mirrors web's `ring-brand/50 bg-brand/5`. Only opacity is
  // animated — the borderColor / backgroundColor stay constant, so
  // className is safe here (animating those channels via className isn't).
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-0 rounded-2xl border-2 border-brand/50 bg-brand/5"
      style={style}
    />
  );
}

function CommentBody({
  entry,
  issueId,
  issueIdentifier,
  onPressChange,
}: {
  entry: TimelineEntry;
  issueId: string;
  issueIdentifier: string | undefined;
  onPressChange?: (entryId: string, pressed: boolean) => void;
}) {
  // When this comment is the active selection target, drop the long-press
  // wrapper AND make the markdown selectable — so the next long-press
  // routes to UIKit's native text-selection magnifier instead of our
  // gesture handler. Selection mode is exited via the Done pill, scrolling
  // the timeline, or unmounting the issue screen.
  const isSelecting = useCommentSelectStore((s) => s.selectingId === entry.id);
  const { getName } = useActorLookup();
  const userId = useAuthStore((s) => s.user?.id);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const toggle = useToggleCommentReaction(issueId);
  const qc = useQueryClient();
  const createComment = useCreateComment(issueId);
  // Failed-comment state for THIS entry — undefined when the entry is a
  // normal server-backed comment OR an in-flight optimistic. Only set when
  // the matching `useCreateComment` mutation errored and the entry was
  // intentionally left in the cache to surface inline retry.
  const failed = useFailedCommentsStore((s) => s.failed[entry.id]);
  // Same query as IssueDescription — TanStack dedupes so this fires once
  // per issue regardless of how many comments need to resolve attachments.
  const { data: attachments } = useQuery(
    issueAttachmentsOptions(wsId, issueId),
  );

  const name =
    entry.actor_name ||
    getName(
      entry.actor_type as "member" | "agent" | null | undefined,
      entry.actor_id,
    );
  const edited =
    entry.updated_at &&
    entry.created_at &&
    entry.updated_at !== entry.created_at;

  // Reactions live on TimelineEntry.reactions (mirrored from Comment).
  // Pass through to the bar; toggle finds existing match by emoji + actor.
  const reactions: Reaction[] = (entry.reactions ?? []) as Reaction[];

  const onToggleReaction = useCallback(
    (emoji: string) => {
      const existing = reactions.find(
        (r) =>
          r.emoji === emoji &&
          r.actor_type === "member" &&
          r.actor_id === userId,
      );
      toggle.mutate({ commentId: entry.id, emoji, existing });
    },
    [reactions, userId, toggle, entry.id],
  );

  const handleRetry = useCallback(() => {
    if (!failed || !wsId) return;
    // Remove the stale optimistic + failed marker BEFORE re-firing so the
    // mutation's own optimistic insert lands on a clean slate instead of
    // creating a duplicate row. The new attempt mints a fresh optimistic id.
    discardFailedComment(qc, wsId, issueId, entry.id);
    createComment.mutate({
      content: failed.content,
      parentId: failed.parentId,
      attachmentIds: failed.attachmentIds,
    });
  }, [failed, qc, wsId, issueId, entry.id, createComment]);

  const handleDiscard = useCallback(() => {
    if (!wsId) return;
    discardFailedComment(qc, wsId, issueId, entry.id);
  }, [qc, wsId, issueId, entry.id]);

  // Per-comment attachments render in two complementary places:
  //   - inline via the markdown renderer when the content references
  //     them with `![](url)` (typical for web/desktop comments authored
  //     in the rich editor)
  //   - via <CommentAttachmentList> below the body when they exist but
  //     aren't referenced in markdown (mobile-authored comments take this
  //     path — see inline-comment-composer.tsx for why mobile doesn't
  //     inline-insert).
  // Mirrors web's split: comment-card.tsx:124 `AttachmentList`.
  //
  // When NOT selecting: long-press fires the native ActionSheetIOS via
  // useCommentLongPress. Markdown is non-selectable so the long-press
  // gesture doesn't race UIKit's text selection.
  //
  // When selecting: long-press wrapper is gone, markdown is selectable.
  // The next long-press fires UIKit's native text-selection magnifier
  // + handles + Copy/Look Up callout. The outer bubble shell carries a
  // translucent primary-tint background as the mode cue (no Done pill).
  // Exit: scroll the timeline, leave the issue, or long-press another body.
  const longPress = useCommentLongPress(entry, issueId, issueIdentifier);

  useEffect(() => {
    if (isSelecting) return;
    onPressChange?.(entry.id, longPress.isPressed);
  }, [longPress.isPressed, entry.id, isSelecting, onPressChange]);

  const body = (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <ActorAvatar
          type={entry.actor_type as "member" | "agent"}
          id={entry.actor_id}
          name={entry.actor_name}
          avatarUrl={entry.actor_avatar_url}
          size={24}
          showPresence
        />
        <Text className="text-sm font-medium text-foreground">{name}</Text>
        <Text className="text-xs text-muted-foreground">
          · {timeAgo(entry.created_at)}
          {edited ? " · (edited)" : ""}
        </Text>
      </View>
      {entry.content ? (
        <Markdown
          content={entry.content}
          attachments={attachments}
          selectable={isSelecting}
        />
      ) : null}
      <CommentAttachmentList
        attachments={entry.attachments}
        content={entry.content}
      />
      {failed ? (
        <FailedActions
          error={failed.error}
          onRetry={handleRetry}
          onDiscard={handleDiscard}
        />
      ) : (
        <ReactionBar
          reactions={reactions}
          currentUserId={userId}
          onToggle={onToggleReaction}
        />
      )}
    </View>
  );

  if (isSelecting) return body;

  return (
    <Pressable onLongPress={longPress.onLongPress} delayLongPress={500}>
      {body}
    </Pressable>
  );
}

/**
 * Inline retry strip shown beneath a failed optimistic comment body. Sits
 * where ReactionBar normally lives — same vertical rhythm, but the slot
 * carries the error message + Retry/Discard buttons. Single source of the
 * error surface (no parallel toast), so the user always lands on the row
 * they typed if they come back later.
 */
function FailedActions({
  error,
  onRetry,
  onDiscard,
}: {
  error: string;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const destructive = THEME[colorScheme].destructive;
  return (
    <View className="flex-row items-center gap-2 mt-0.5">
      <Ionicons name="alert-circle" size={14} color={destructive} />
      <Text className="flex-1 text-xs text-destructive" numberOfLines={1}>
        {error || "Couldn't send"}
      </Text>
      <Pressable
        onPress={onRetry}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Retry sending comment"
      >
        <Text className="text-xs text-primary font-medium">Retry</Text>
      </Pressable>
      <Pressable
        onPress={onDiscard}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Discard failed comment"
      >
        <Text className="text-xs text-muted-foreground font-medium">
          Discard
        </Text>
      </Pressable>
    </View>
  );
}
