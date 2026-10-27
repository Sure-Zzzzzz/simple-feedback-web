# simple-feedback-web

产品反馈前端，四页面 qiankun 子应用（提交反馈 / 我的反馈 / 反馈管理 / 应用注册表），以 `/app/feedback/` 为基路径由门户宿主挂载。人员通道 PKCE：复用宿主门户会话换发令牌，令牌仅存 sessionStorage（`feedback.accessToken`），所有请求 `credentials: 'omit'` 不带门户 Cookie。

## 页面行为（唯一事实标准）

**提交反馈**：目标模块下拉 = 本人可访问应用 ∩ 注册表启用项（hint 聚形态名称与门户侧边栏同源，hint 失败回退注册表全量不影响提交）；类型四选一 / 打分 1-10（默认 10 分）/ 文本 / 选填邮箱（IAM 资料预填，可改可清）/ 附件 ≤3 张 jpg/png/webp（前端拦截 + 服务端 413/415 双校验）。幂等键为表单会话级：失败重试复用同键，成功后轮换；环境快照（ua/viewport/theme/locale）与幂等键同生命周期冻结，随提交落库。

**我的反馈**：列表仅本人（owner 等值），内容关键词搜索（显式查询——回车或「查询」触发、「重置」清空，按钮右贴；未提交的输入不随翻页生效）+ 回复内联展示 + 附件下载；mine 形态不出现处理人字段与内部备注；非本人 id 直开 404。

**反馈管理**（admin 权限）：筛选（应用编码 / 状态 / 类型 / 来源 / 打分）+ 关键词（命中反馈内容或提交人，输入框回车或「查询」触发）为显式查询——「查询」按钮触发、「重置」清空回第 1 页，输入变更不打请求（查询/重置钮靠筛选行右端）；分页翻页/改页大小即时生效（按最近一次查询的条件）。DATA 受限账号只见获权应用行（列表遮蔽 + 详情 404 + 处理 404，写路径遮蔽）；提交人列展示 displayName 随行快照（聚形态经档案 SPI 落库；快照为空回退裸 subjectId）。处理 = 状态迁移 + 内部备注（提交人不可见）+ 答复（提交人可见）；行版本冲突 409 提示刷新；深链按 id 服务端定位（跨页未命中可直达）。

**应用注册表**（registry 权限）：数据来源徽标三态（`IAM 同源` / `本表登记` / `未核对`）——同源行展示名只读（以 IAM 为准，服务端强改 409）并提供"从 IAM 重新同步展示名"；受理门（启用/停用）与处理组始终本表可编辑；登记时编码命中 IAM 可信应用则服务端自动抄录官方名。目录不可核对（adaptor 缺席 / 出站失败）时全字段可编辑。

三列表页均有请求序号竞态护栏（只放行最新一次请求）与错误态 + 重试；权限不足（403）呈现错误态而非空列表。服务端 5xx 和非反馈契约错误体只显示安全提示，保留 HTTP 状态与请求关联 ID 供排障。

页面准入由门户负责投影，子应用同时负责深链拦截：门户从当前用户可见的 `menuTree` 提取 `requiredPagePermission`，通过 qiankun mount props 的 `pagePermissions` 传入；Feedback 路由守卫按 `/submit`、`/my`、`/admin`、`/registry` 逐页校验，撤权后直达地址进入无权页，不依赖 API 403 才发现。standalone 开发态可省略该属性；qiankun 正式挂载缺少投影时直接进入无权页，避免旧门户配置把所有页面误放行。

## 兼容性与发布

| 组件 | 版本 |
| --- | --- |
| Feedback Web | `1.0.0`（首发，dist/容器镜像交付） |
| Feedback Server core / starter | `1.0.1` |
| Feedback REST OpenAPI（人员与服务主体通道） | `1.0.1`（Web 1.0.0 消费人员通道） |
| Feedback IAM adaptor | `1.0.1` |
| IAM Server | `>= 1.3.7`（页面准入详情端点） |
| IAM Theme Contract | `1.0.5` |

- `1.0.0` 首发：四页面、下拉应用名称与 IAM 可信应用同源、注册表来源徽标与同源锁、展示名重同步、提交人 displayName 快照展示、管理页显式查询与关键词搜索（命中反馈内容、提交人展示名或 subjectId，回车或点查询生效）。该 Web 首发消费 Feedback Server/core/starter `1.0.1` 与 REST OpenAPI `1.0.1`；关键词查询、列表投影和错误契约等服务端变更归属 server `1.0.1`，不另行伪造 Web 版本号。
- Web 发布门禁：生产 `check/build` 必须注入非空 `VITE_FEEDBACK_IAM_CLIENT_ID`；发布事实是从 release commit/tag 构建的 `dist/` 或容器镜像，不把 `dist/` 加入 Git，也不把 registry、客户端 ID 或其他凭据写入仓库。
- 首发不设 CHANGELOG，本 README 为唯一事实标准；后续版本起逐版记录。
- 可信应用登记（IAM 应用 / 权限清单 / PKCE 客户端 / 静态入口目录形式）以 [docs/TRUSTED_APPLICATION_ONBOARDING.md](docs/TRUSTED_APPLICATION_ONBOARDING.md) 为准，逐字权威。

本仓是 `private` 的业务前端，不发布 npm 包；`package.json.version` 记录 Web 应用版本，发布制品是通过生产构建生成的 `dist/` 静态目录或其容器镜像。`dist/` 按仓库规则忽略，正式发布由 CI 保存构建制品并部署业务 Nginx；版本发布事实以对应 release commit 或标签为准。

## 本地开发

```bash
npx pnpm@9.15.4 install
npx pnpm@9.15.4 run dev        # vite 5179 端口（standalone 形态）
npx pnpm@9.15.4 run check      # type-check + lint + test + build 四闸
npx pnpm@9.15.4 run build      # 产物 dist/，base=/app/feedback/，qiankun 应用名 feedback
```

生产构建和 `check` 要求构建环境显式提供非空 `VITE_FEEDBACK_IAM_CLIENT_ID`；`.env.example` 只保留占位值，clean checkout 不会因此直接通过生产构建。CI 或受控本地验收环境负责注入公共客户端 ID，仓库、镜像构建脚本和日志均不保存该值。`VITE_FEEDBACK_IAM_ISSUER` 为空时使用统一入口同源 OAuth 路径。`deploy/nginx/feedback-web.conf` 是业务 Nginx 配置：保留 `/app/feedback/**` 页面路径，并将同源 `/api/feedback/**` 反代到 `feedback-server:8393`。Gateway 只把页面和 API 原样转到这个 Nginx，不能把 Java 端口或 Envoy 宿主端口登记为 `targetOrigin`。
