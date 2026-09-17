## Why

Issue 详情页目前按讨论线程聚合评论：回复会被移回根评论所在位置，而不是停留在自身实际发生的时间点。对于由成员、Agent、状态变化和执行结果共同构成的工作流，这会把最新结论或待办藏进较早的线程，使页面底部不能可靠代表当前进度，并造成 Web、Desktop 与 Mobile 的跟进困难。

## What Changes

- **BREAKING（客户端展示语义）**：将 Issue 主时间线定义为严格的全局时间序列。所有由现有 API 返回的持久化 `TimelineEntry`——评论、回复和活动——都按自身 `created_at` 升序排列，并以 `id` 作为时间相同时的稳定次序；API 和数据格式保持兼容。
- 回复不再因 `parent_id` 被嵌套回根评论的位置；每条回复成为独立时间线项，同时保留轻量父评论引用和跳转能力。
- Web 与 Desktop 通过共享的 `packages/views` 实现一次性获得相同行为。
- iOS 与 Android 的 Mobile 时间线移除“整条回复链打包进父评论行”的显示转换，以移动端独立组件实现同一排序语义。
- 已解决评论不再默认折叠或聚合，只在其自身 row 上显示状态标识和轻度视觉弱化；评论深链接、通知定位、Agent 结果、时间线 minimap、新内容分割线和附件浏览顺序全部遵循全局时间线位置。
- 运行中或尚未产出评论的 Agent run 是平台辅助状态，不属于持久化主时间线，也不参与跨端条目 ID/顺序验收；Agent 产出的持久化结果评论按自身时间进入主时间线，并使用 API 返回的真实 `parent_id`。
- 补充跨端回归测试，覆盖旧评论收到新回复、多层回复、活动与评论交错、相同时间戳、WebSocket 乱序到达及折叠/深链接行为。

## Capabilities

### New Capabilities

- `issue-timeline-chronology`: 定义 Issue 持久化主时间线跨 Web、Desktop、iOS 和 Android 的统一全局时间排序、回复上下文、解决状态、Agent 结果和导航行为。

### Modified Capabilities

无。当前仓库没有既有 OpenSpec capability；本提案建立对应的首个正式行为契约。

## Impact

- Web/Desktop：`packages/core/issues/timeline-view.ts`、`packages/views/issues/components/issue-detail.tsx`、评论行/卡片、解决状态辅助逻辑、minimap、相关测试。
- Mobile：`apps/mobile/lib/timeline-thread.ts`、`components/issue/timeline-list.tsx`、评论行/卡片、深链接及附件展示顺序、相关测试。
- Shared core：继续使用已有 TimelineEntry 数据契约和升序排序函数；如提取纯展示模型，只允许放入 `packages/core` 且不得引入平台 UI 依赖。
- Server/API：`GET /api/issues/:id/timeline` 已按 `(created_at, id)` 升序返回，无需修改接口或数据库。
- CLI：`multica issue timeline` 已遵循全局时间顺序，无需修改。
- 发布：这是客户端展示语义的破坏性变更。Web 与 Desktop 共享代码但分别构建；Mobile 为独立发布面，必须同步验证 iOS 与 Android 行为。已安装的旧客户端不会自动继承新展示语义。
