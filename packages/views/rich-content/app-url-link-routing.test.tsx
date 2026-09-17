/**
 * MUL-5208 — a link that points back at this deployment is an in-app
 * destination, not an external one.
 *
 * Chat and comments render agent-written content full of absolute URLs. When one
 * of them addresses this app, `window.open` sends it to the system browser on
 * desktop (Electron routes every renderer-opened window through
 * `shell.openExternal`), which is how "click an issue link, get a browser
 * window" happens. The real `openLink` is exercised here — mocking it would test
 * nothing about the routing decision.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Attachment } from "@multica/core/types";

const APP_ORIGIN = "https://app.example";

const { getAttachmentTextContentMock } = vi.hoisted(() => ({
  getAttachmentTextContentMock: vi.fn(),
}));

vi.mock("@multica/core/api", () => ({
  api: {
    getAttachmentTextContent: getAttachmentTextContentMock,
    getBaseUrl: () => "",
  },
  PreviewTooLargeError: class extends Error {},
  PreviewUnsupportedError: class extends Error {},
}));

vi.mock("../issues/hooks", () => ({
  useResolveIssueIdentifier: () => null,
}));

// Only the workspace hooks are stubbed — the real path helpers stay in place so
// the reserved-slug rule that decides in-app vs external is the shipped one.
vi.mock("@multica/core/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@multica/core/paths")>()),
  useWorkspacePaths: () => ({
    issueDetail: (id: string) => `/test/issues/${id}`,
    projectDetail: (id: string) => `/test/projects/${id}`,
  }),
  useWorkspaceSlug: () => "test",
}));

vi.mock("../navigation", () => ({
  useNavigation: () => ({ push: vi.fn(), openInNewTab: vi.fn() }),
  useOptionalNavigation: () => ({ push: vi.fn(), openInNewTab: vi.fn() }),
  resolveClickIntent: () => "push",
  useAppOrigin: () => APP_ORIGIN,
  AppLink: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("../editor/link-hover-card", () => ({
  useLinkHover: () => ({}),
  LinkHoverCard: () => null,
}));

vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}));

import { RichContent } from "./rich-content";

let navigatedPaths: string[] = [];
let openSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  navigatedPaths = [];
  window.addEventListener("multica:navigate", captureNavigate);
  openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  window.removeEventListener("multica:navigate", captureNavigate);
  vi.restoreAllMocks();
});

function captureNavigate(e: Event) {
  const path = (e as CustomEvent<{ path?: string }>).detail?.path;
  if (path) navigatedPaths.push(path);
}

function renderContent(content: string, attachments?: Attachment[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RichContent content={content} attachments={attachments} />
    </QueryClientProvider>,
  );
}

describe("RichContent link routing", () => {
  it("routes a link to this deployment into the app instead of the browser", () => {
    renderContent(`[MUL-1](${APP_ORIGIN}/acme/issues/MUL-1)`);

    screen.getByText("MUL-1").click();

    expect(navigatedPaths).toEqual(["/acme/issues/MUL-1"]);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("still hands a genuinely external link to the browser", () => {
    const external = "https://github.com/multica-ai/multica/pull/1";
    renderContent(`[#1](${external})`);

    screen.getByText("#1").click();

    expect(navigatedPaths).toEqual([]);
    expect(openSpy).toHaveBeenCalledWith(
      external,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("keeps an attachment download URL on the app origin external", () => {
    const download = `${APP_ORIGIN}/api/attachments/abc/download`;
    renderContent(`[report.pdf](${download})`);

    screen.getByText("report.pdf").click();

    expect(navigatedPaths).toEqual([]);
    expect(openSpy).toHaveBeenCalledWith(
      download,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens a known Markdown attachment link in the inline preview instead of downloading it", async () => {
    const id = "11111111-2222-4333-8444-555555555555";
    const download = `${APP_ORIGIN}/api/attachments/${id}/download`;
    const attachment: Attachment = {
      id,
      workspace_id: "workspace-1",
      issue_id: "issue-1",
      comment_id: "comment-1",
      chat_session_id: null,
      chat_message_id: null,
      uploader_type: "agent",
      uploader_id: "agent-1",
      filename: "ARCH-DESIGN-v1.md",
      url: download,
      download_url: download,
      markdown_url: download,
      content_type: "text/markdown",
      size_bytes: 128,
      created_at: "2026-08-31T00:00:00Z",
    };
    getAttachmentTextContentMock.mockResolvedValueOnce({
      text: "# 完整架构设计\n\n这是可供审核的方案正文。",
      originalContentType: "text/markdown",
    });

    renderContent(`[完整 Design](${download})`, [attachment]);

    screen.getByText("完整 Design").click();

    await waitFor(() => {
      expect(getAttachmentTextContentMock).toHaveBeenCalledWith(id);
    });
    expect(await screen.findByText("完整架构设计")).toBeTruthy();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("keeps a same-origin /uploads file external — the backend serves it, not the router", () => {
    const upload = `${APP_ORIGIN}/uploads/2026/07/notes.pdf`;
    renderContent(`[notes.pdf](${upload})`);

    screen.getByText("notes.pdf").click();

    expect(navigatedPaths).toEqual([]);
    expect(openSpy).toHaveBeenCalledWith(
      upload,
      "_blank",
      "noopener,noreferrer",
    );
  });
});
