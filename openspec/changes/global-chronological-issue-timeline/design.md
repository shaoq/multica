## Context

Multica 的 Issue 详情页同时承载人类评论、Agent 回复、状态变化和执行记录，因此它首先是工作进展时间线，其次才是讨论线程。服务端 `GET /api/issues/:id/timeline` 已返回按 `(created_at ASC, id ASC)` 排列的平铺数据；Web/Desktop 和 Mobile 在渲染前又按 `parent_id` 对评论分组，导致晚到回复回到旧根评论的位置。

当前 Web 与 Desktop 共享 `packages/views` 的 `IssueDetailRoute`。Mobile 因平台边界拥有独立的数据整形和 UI：`buildTimelineRows` 会将整个回复链打包进根评论行。两种实现都破坏了同一个产品语义，必须由同一份行为契约约束并分别落地。

约束如下：

- React Query 继续持有服务端时间线数据，Zustand 不保存服务端评论副本。
- `packages/views` 不得引入平台路由 API；跳转继续通过现有适配层和锚点能力完成。
- Mobile 可以拥有不同视觉布局，但持久化 `TimelineEntry` 的数量、可见性、身份和顺序必须与 Web/Desktop 一致。运行中 Agent 状态等非持久化辅助界面不计入该序列。
- 已安装客户端必须继续兼容当前 API；本变更不得要求服务端双写或新响应格式。
- 同一时间戳使用 ID 排序，保证初次获取、乐观写入和 WebSocket 回放得到相同结果。

## Goals / Non-Goals

**Goals:**

- 使 Issue 主视图成为严格、可预测的全局工作时间线。
- 让页面底部可靠代表最新发生的可见事件，避免最新人工 Action 或 Agent 结论藏在旧线程中。
- 保留回复对象及其父评论的关系、引用和跳转，而不让该关系改变显示位置。
- 保持 Web、Desktop、iOS 和 Android 的行为一致。
- 保持深链接、通知跳转、Agent run、解决状态、新内容分割线、附件浏览和实时更新正确。

**Non-Goals:**

- 不修改评论的存储模型、`parent_id` 语义或 Agent 触发/继承规则。
- 不修改服务端时间线 API、数据库排序或 CLI 的全局时间线输出。
- 不在本变更中新增完整的独立线程页面；父评论引用与跳转足以保留必要上下文。
- 不重新设计 Issue 活动类型或 Agent 执行日志内容。
- 不为旧客户端引入兼容分支、双写或服务端特性开关。

## Decisions

### 1. 主时间线以每个条目自身的时间排序

所有可见 `TimelineEntry` 在进入展示模型前统一按 `(created_at ASC, id ASC)` 排序。评论是否带 `parent_id` 不参与位置计算。活动合并只能合并在全局序列中相邻且满足现有规则的活动，禁止跨过评论或回复进行合并。

选择该方案，而不是“按线程最后活动时间移动整个线程”，因为后者仍会把线程内部跨时段的工作压缩成一个块，无法还原 Agent 执行、状态变化和人工回复之间的真实因果顺序。

### 2. `parent_id` 只驱动回复上下文

回复作为独立时间线项渲染，并显示紧凑父评论引用，包括父评论作者、时间和截断摘要。点击引用跳转到父评论；父评论不在当前数据中或已不可用时显示稳定的“原评论不可用”状态，不隐藏回复、不改变回复位置。

Web/Desktop 使用共享展示组件；Mobile 使用适合窄屏的紧凑引用，但引用身份、目标和缺失回退必须一致。

不采用递归缩进树，因为深层回复会压缩可读宽度，也会重新引入“线程结构决定页面位置”的心理模型。

### 3. Web/Desktop 改为平铺评论展示模型

`IssueDetail` 不再从 `displayTimeline` 中过滤 replies 并构造根评论专属 `threadReplies` 渲染树。每条评论都形成自己的时间线 row；现有线程关系辅助数据仅用于父引用、参与者/解决状态推导和跳转。

`CommentCard` 的根评论加内嵌 replies 模型拆为单评论展示单元。Agent 结果评论只在其持久化评论 row 中出现，排序时间和直接父引用分别使用该评论的 `created_at` 与 API 返回的真实 `parent_id`，不得用 trigger anchor 改写。运行中或无结果评论的 run 继续作为辅助执行状态附着于现有触发位置或执行面板，但不进入主时间线条目序列。Desktop 自动继承共享实现，平台入口无需复制业务逻辑。

### 4. Mobile 改为一条评论一个 FlashList row

Mobile 停止通过 `buildTimelineRows` 把 descendants 打包进父行。数据转换只负责稳定排序、活动合并和为回复解析父引用；每条评论、回复或活动对应独立 row。iOS 和 Android 共用该 React Native 实现。

新内容分割线、初始滚动、发布后滚动、深链接索引与图片序列都从最终平铺 rows 推导，不能再从根评论 bundle 推导。Mobile 的 header/runs sheet 可继续表达运行中 Agent 状态，但不得把该辅助状态混入跨端持久化条目 ID 序列。

### 5. 解决状态不得破坏时间顺序

解决操作继续使用现有服务端字段和权限。带 `resolved_at` 的评论始终保留独立 row、作者、时间、正文、附件和操作，不默认折叠，也不生成替代整条线程的聚合摘要。解决状态只通过该 row 内的 `Resolved` badge 和轻度弱化卡片装饰表达；弱化不得降低正文可读性。用户主动使用通用的单评论收起能力时，只收起该评论正文，不影响其他条目或主时间线位置。

### 6. 一个纯函数契约约束所有到达路径

初次 API 数据、乐观新评论、mutation success 和 WebSocket `comment:created` 都必须通过 `packages/core` 中同一个纯展示模型函数。该函数先按 `(created_at, id)` 稳定排序，再只合并在序列中相邻且符合现有规则的活动，并解析回复的直接父评论；Web/Desktop 与 Mobile 必须直接导入它，不允许复制实现。不得把排序状态复制到 Zustand。

### 7. API 与旧客户端保持兼容

服务端、数据库和响应 schema 不变。新 Web、Desktop 和 Mobile 客户端只改变当前平铺数据的展示方式。旧客户端继续按原线程方式展示，直到各自升级；因此发布说明必须明确跨端版本边界。

## Risks / Trade-offs

- **[风险] 回复与父评论不再相邻，用户可能失去讨论上下文。** → 每条回复提供紧凑父引用、摘要和跳转；不以重新嵌套解决上下文问题。
- **[风险] 已解决长线程在全局视图占用更多垂直空间。** → 保留通用的用户主动单评论收起能力；resolved 状态本身不触发折叠，不牺牲时间位置和最新评论可见性。
- **[风险] Agent run 当前锚定逻辑与线程分组耦合。** → 主时间线只认持久化 `TimelineEntry`；针对 trigger、真实 `parent_id`、结果评论和无评论 run 分别建立回归场景，辅助 run 不计入跨端条目顺序。
- **[风险] Mobile FlashList row 数增加，可能影响长 Issue 性能。** → 保持虚拟化、稳定 key 和 memo；使用长时间线性能测试确认滚动与跳转，无需恢复 bundle。
- **[风险] Web/Desktop 与 Mobile 分别实现后发生语义漂移。** → 将排序、缺失父级、同时间戳和实时乱序定义为共享验收矩阵，并在两端运行同构测试数据。
- **[风险] GitNexus 对工作区的完整刷新被 iOS Pods 放大，当前图结果仍为 stale。** → 实施前排除生成的 Pods 后刷新索引，并对 `IssueDetail`、`collectThreadReplies`、`buildTimelineRows` 做最终影响分析；本设计结论已由当前源码导入链和 API 实际返回顺序交叉确认。

## Migration Plan

1. 先以固定数据集建立 Web/Desktop 与 Mobile 的失败回归测试，锁定全局排序和回复引用契约。
2. 调整 Web/Desktop 共享展示模型并验证 Web、Electron 的相同 DOM 顺序、深链接和实时更新。
3. 调整 Mobile 平铺 rows、回复引用及派生功能，并验证 iOS 和 Android 相同顺序。
4. 运行 TypeScript、共享视图、Mobile、Go 时间线回归和跨端手工验收；服务端测试用于证明 API 顺序未改变。
5. 先部署 Web，再构建 Desktop 与 Mobile。各客户端升级后获得新行为，服务端无需迁移。

回滚仅需回滚客户端展示代码；API 和数据没有迁移，无需恢复数据库。若某端必须独立回滚，应在发布说明中标记短暂的跨端展示差异。

## Open Questions

无。产品决定已经明确：Issue 主页面采用持久化 `TimelineEntry` 的全局时间顺序；线程关系只提供上下文；运行中 Agent 状态是辅助界面；resolved 状态不默认折叠。
