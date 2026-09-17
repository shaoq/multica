## 1. 影响确认与共享行为基线

- [x] 1.1 记录 GitNexus 仓库、worktree、索引提交和 `IssueDetail`、`CommentCard`、`buildTimelineRows`、`buildCommentRunView` 的 upstream impact；对 UNKNOWN 用当前源码搜索补证。
- [x] 1.2 在 `packages/core` 添加失败测试，覆盖旧根评论收到晚到回复、活动交错、相同时间戳、缺失父评论和相邻活动合并。
- [x] 1.3 在 `packages/core` 实现唯一的纯时间线展示模型并导出，使其返回稳定排序的持久化条目及直接父评论上下文。
- [x] 1.4 运行共享模型测试，确认失败样例转绿且输入数组未被修改。

## 2. Web 与 Desktop 共享实现

- [x] 2.1 在 `packages/views` 添加失败回归测试，断言晚到回复按自身时间成为独立 DOM row，且直接父引用使用真实 `parent_id`。
- [x] 2.2 将 `IssueDetail` 改为消费共享平铺模型；活动只能在全局序列中相邻时合并。
- [x] 2.3 将 `CommentCard` 增加单评论平铺模式和可点击父引用，覆盖父级作者、时间、摘要及不可用回退。
- [x] 2.4 调整深链接、通知定位和发布后滚动，直接以回复自己的 row ID/索引定位。
- [x] 2.5 调整 minimap 与页面内查找，使每条评论 row 都可独立导航。
- [x] 2.6 调整图片附件序列，使其严格跟随平铺评论顺序。
- [x] 2.7 添加失败回归测试，断言 resolved 评论默认保留完整独立 row，且不隐藏晚到回复。
- [x] 2.8 移除 resolved thread 默认聚合/折叠路径，只保留逐条状态标识、轻度装饰和通用单评论主动收起。
- [x] 2.9 添加 Agent run 回归测试，断言结果评论按自身时间显示、直接父引用不被 trigger 投影改写，未持久化 run 不进入条目 ID 验收序列。
- [x] 2.10 调整 Agent run 索引：带结果评论的 run 元数据附着于结果 row；无结果 run 仅保留辅助展示。
- [x] 2.11 运行共享视图、评论卡片、run、minimap 与 typecheck 测试，验证 Web 和 Electron 共享入口没有复制排序逻辑。

## 3. iOS 与 Android Mobile 实现

- [x] 3.1 在 `apps/mobile` 添加失败测试，断言 `buildTimelineRows` 返回每条评论/回复/活动一个 row，并与共享模型顺序一致。
- [x] 3.2 将 Mobile 展示模型改为直接复用 `packages/core` 纯函数，删除 descendants bundle 语义。
- [x] 3.3 调整 Mobile `CommentCard` 为单评论 bubble，增加可点击的直接父评论引用和不可用回退。
- [x] 3.4 调整 FlashList key、深链接、高亮和父引用跳转，使目标始终是评论自身 row。
- [x] 3.5 调整“上次查看后新增”分割线，使其从最终平铺 rows 计算。
- [x] 3.6 调整图片浏览顺序，使其从最终平铺评论 rows 计算。
- [x] 3.7 移除 Mobile resolved thread 默认折叠，只保留逐条标识与轻度装饰。
- [x] 3.8 运行 Mobile 单元测试、typecheck 与 lint。
- [ ] 3.9 在真实 iOS/Android 设备上验收滚动、回复、深链接、父引用跳转和附件浏览。

## 4. 跨端与兼容性验证

- [x] 4.1 运行服务端时间线测试，证明 `GET /api/issues/:id/timeline` 仍按 `(created_at, id)` 升序返回且 schema 未改变。
- [x] 4.2 对同一固定样例记录 Web、Electron、iOS 和 Android 的持久化 `TimelineEntry` ID 序列并确认一致；非持久化 Agent 辅助状态不计入。
- [x] 4.3 验证 API 初始加载、乐观评论、mutation 回执和 WebSocket 事件最终收敛到同一顺序，无重复或丢失。
- [x] 4.4 在发布说明中标记客户端展示语义为 BREAKING，同时说明服务端/API/数据兼容和旧客户端继续可用。

## 5. 完成检查

- [x] 5.1 运行相关 `packages/core`、`packages/views`、`apps/mobile` 测试以及 TypeScript typecheck/lint。
- [ ] 5.2 按风险运行 Go 时间线回归和项目级验证，确认无 API、权限、评论数量或实时同步回归。
- [x] 5.3 在提交前运行 GitNexus `detect_changes --scope all`；任何 `partial`、`truncated` 或 UNKNOWN 结果必须重新分析或用当前源码搜索补证。
- [ ] 5.4 对照 `issue-timeline-chronology` 的每个 Scenario 完成人工验收并记录证据。

## 验证记录（2026-09-13）

- 自动化通过：OpenSpec strict validation、GitNexus detect-changes（24 files / 77 symbols，LOW，无 partial/truncated）、`git diff --check`、Core 全量测试（1720）、Views 时间线定向测试（81）、Mobile 全量测试（130）、各端 TypeScript typecheck/lint，以及服务端 `TestListTimeline` 定向回归。
- `make check` 的 TypeScript typecheck 与全量前端测试已通过；Go 阶段被与本提案无代码依赖的既有测试阻断：`cmd/multica.TestRunConfigShowIncludesProfileAndDefaults` 在当前 macOS/Go 1.26 环境写入 `os.Pipe` 时超时，`repocache.TestIsolatedCheckoutCloneWithoutHardlinksIsIndependent` 在全量并发运行时收到 `operation not permitted`，后者隔离重跑通过。因此 5.2 保持未完成，不把部分通过误记为项目级全绿。
- 尚需人工完成：真实 iOS/Android 设备上的滚动与导航验收（3.9），以及逐项 Scenario 的跨端人工验收记录（5.4）。
