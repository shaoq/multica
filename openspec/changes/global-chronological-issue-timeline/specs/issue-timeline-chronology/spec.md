## ADDED Requirements

### Requirement: 全局时间线顺序
系统 SHALL 在 Issue 主时间线中按每个持久化 `TimelineEntry` 自身的 `created_at` 升序展示评论、回复和活动；当 `created_at` 相同时，系统 MUST 按条目 ID 升序提供稳定顺序。运行中或未产出评论的 Agent run 属于辅助执行状态，不参与该条目序列。

#### Scenario: 回复旧评论
- **WHEN** 用户或 Agent 在较早的根评论下创建一条新回复
- **THEN** 新回复 SHALL 出现在其实际创建时间对应的全局位置，而不是回到根评论所在位置

#### Scenario: 评论与活动交错
- **WHEN** 评论、回复、状态变化和任务完成事件按交错时间发生
- **THEN** Issue 主时间线 SHALL 按所有条目的实际发生顺序呈现完整序列

#### Scenario: 相同时间戳
- **WHEN** 两个或多个时间线条目拥有相同的 `created_at`
- **THEN** 所有客户端 MUST 使用条目 ID 升序得到相同且稳定的显示顺序

### Requirement: 回复关系不决定位置
系统 MUST 将每条回复作为独立时间线项展示，`parent_id` 只能用于表达回复上下文、导航和线程状态，不得用于计算主时间线位置。

#### Scenario: 多层回复
- **WHEN** 评论形成根评论、回复及回复的回复的多层关系
- **THEN** 每个条目 SHALL 按自身时间出现在全局时间线中，并保留其直接父评论关系

#### Scenario: 父评论不可用
- **WHEN** 回复的父评论无法从当前授权数据中取得或已经不可用
- **THEN** 系统 SHALL 继续显示回复及稳定的上下文缺失提示，不得隐藏、回移或错误关联该回复

### Requirement: 可读的父评论上下文
系统 SHALL 为回复提供紧凑、可识别的父评论引用，并允许用户导航到可用的父评论；不同产品端可以采用符合平台的布局，但 MUST 保持相同身份和目标语义。

#### Scenario: 查看回复来源
- **WHEN** 用户阅读一条回复
- **THEN** 用户 SHALL 能看到该回复所回应评论的作者和摘要，并能跳转到该父评论

#### Scenario: 深层回复上下文
- **WHEN** 一条回复直接回应另一条回复
- **THEN** 引用 SHALL 指向直接父回复，而不是错误地统一指向线程根评论

### Requirement: 实时更新保持确定顺序
系统 MUST 对初次 API 数据、乐观写入、mutation 回执和 WebSocket 事件应用同一稳定排序契约，不得以消息到达客户端的顺序作为最终显示顺序。

#### Scenario: WebSocket 乱序到达
- **WHEN** 较晚创建的条目先于较早创建的条目到达客户端
- **THEN** 客户端 SHALL 根据 `(created_at, id)` 重新排列，并与重新加载后的服务端结果一致

#### Scenario: 乐观回复被服务端确认
- **WHEN** 乐观回复随后被服务端正式评论替换
- **THEN** 时间线 SHALL 保留正确的全局位置、父评论引用和唯一条目身份

### Requirement: 跨端行为一致
Web、Desktop、iOS 和 Android MUST 对相同 Issue 数据展示相同的持久化 `TimelineEntry` 集合和全局顺序；平台差异只能影响布局、交互表现以及非持久化 Agent 运行状态的辅助入口。

#### Scenario: 同一 Issue 跨端查看
- **WHEN** 用户在 Web、Desktop 和 Mobile 打开包含根评论、嵌套回复及活动的同一 Issue
- **THEN** 各端 SHALL 以相同顺序展示相同条目，且最新评论位于所有更早可见事件之后

#### Scenario: Web 与 Desktop 共享实现
- **WHEN** Web/Desktop 共享时间线组件的排序行为发生变化
- **THEN** 两个产品端 SHALL 自动获得相同行为，不得在应用入口复制另一套排序逻辑

### Requirement: 导航与阅读位置遵循全局序列
系统 MUST 依据最终平铺时间线计算深链接、通知定位、发布后滚动、新内容分割线和时间线导航位置。

#### Scenario: 打开回复深链接
- **WHEN** 用户通过通知或 URL 打开某条回复
- **THEN** 页面 SHALL 直接定位到该回复自身的全局时间线位置，而不是只定位到线程根评论

#### Scenario: 发布新回复
- **WHEN** 用户成功发布回复
- **THEN** 页面 SHALL 滚动到新回复的独立时间线项，且该项位于所有更早条目之后

#### Scenario: 新内容分割线
- **WHEN** 用户重新打开 Issue 且上次查看后产生了回复或活动
- **THEN** 分割线 SHALL 出现在第一个晚于上次查看时间的全局条目之前

### Requirement: 解决状态不破坏时间顺序
系统 MUST 在条目原始全局位置表达已解决状态，不得将解决线程的评论重新聚合到根评论位置，也不得因 resolved 状态默认折叠或隐藏任何评论正文。

#### Scenario: 解决包含晚到回复的线程
- **WHEN** 一个包含跨时段回复的线程被标记为已解决
- **THEN** 各评论 SHALL 保持原始全局位置、完整正文和独立 row，并仅在带 `resolved_at` 的评论 row 内显示解决标识与轻度卡片装饰

#### Scenario: 主动收起单条已解决评论
- **WHEN** 用户使用通用的单评论收起能力收起一条已解决评论
- **THEN** 系统 SHALL 只收起该评论正文并保留其独立 row、作者、时间与解决标识，不得隐藏或移动其他评论

### Requirement: 附件和 Agent 运行保持时间语义
附件浏览顺序和 Agent 结果评论展示 MUST 从最终全局时间线推导，不得继续依赖根评论 bundle 或展示层推导的 trigger 父关系。

#### Scenario: 跨回复浏览图片
- **WHEN** 用户依次浏览分布在根评论和回复中的图片附件
- **THEN** 图片序列 SHALL 遵循对应评论在全局时间线中的顺序

#### Scenario: Agent 结果回应旧评论
- **WHEN** Agent run 由旧评论触发但在较晚时间产出回复
- **THEN** 结果回复 SHALL 显示在其实际创建时间位置，直接父引用 SHALL 使用 API 返回的真实 `parent_id`，同时运行元数据 SHALL 保留与 trigger 和 run 的关联

#### Scenario: Agent run 尚未产出持久化评论
- **WHEN** Agent run 正在运行或结束但尚未产出持久化结果评论
- **THEN** 客户端 MAY 在平台辅助界面显示执行状态，但该状态 MUST NOT 改变持久化主时间线的条目 ID 集合或排序

### Requirement: 服务端兼容性
本能力 SHALL 使用现有 TimelineEntry、`parent_id` 和时间线 API，不得要求数据库迁移、新响应格式或旧客户端兼容分支。

#### Scenario: 新旧客户端并存
- **WHEN** 新客户端和未升级客户端连接同一服务端
- **THEN** 两者 SHALL 成功读取同一时间线响应，新客户端采用全局顺序，旧客户端继续使用其已有展示方式
