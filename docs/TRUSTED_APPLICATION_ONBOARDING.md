# 产品反馈 Web 可信应用接入手册

本文是产品反馈应用（simple-feedback-web）接入统一门户的**唯一权威登记手册**：应用注册、授权发布及部署均为管理写操作，须另行获得批准后执行；本仓文件不是已注册、已授权或已部署的证据。登记目标值以本文件为准，不参照其他应用的登记形态。

## 应用与门户

| 项目 | 目标值与边界 |
| --- | --- |
| 应用编码 | `feedback`（与权限码前缀 `feedback.*` 对齐；模块编码不带 `simple` 前缀，与 iam/aksk/kms 家族一致） |
| 应用名称 | 产品反馈 |
| 应用类型 | 内置可信应用目标；内置标记只能通过实际 IAM 支持的管理路径设置 |
| 静态入口 | 业务 Nginx 托管目录 `/app/feedback/`；Portal 登记入口使用 `/app/feedback/index.html`，完整 HTTPS 同源地址随部署批准确定 |
| 静态基路径与路由前缀 | `/app/feedback/` 与 `/app/feedback` |
| Gateway 业务 upstream | `targetOrigin` 指向承接页面与 API 的业务 Nginx HTTP origin；Gateway 保留公共路径原样转发，不指向 Java 8393 或 Envoy 宿主诊断端口 |
| 业务 API | `/api/feedback` 族（submissions / me/submissions / submission-hints / applications / selectable-applications），Bearer 人员令牌经同一业务 Nginx 反代到 Feedback runtime；Nginx 原样转发 Authorization |
| 导航 | IAM 门户提供菜单节点（提交入口、我的反馈、反馈管理、应用注册表），子应用不创建侧栏、账户或退出体系 |
| PAGE 投影 | Portal 将当前用户可见 `menuTree[*].requiredPagePermission` 通过 qiankun mount props 的 `pagePermissions` 传入；Feedback 路由守卫对四页和深链逐页校验。standalone 开发态可省略该属性；qiankun 正式挂载缺少投影时进入无权页，不得依赖旧 Portal 兼容放行 |
| 主题 | 消费官方 `themeSnapshot` 初始快照及 `theme.subscribe` 订阅，卸载释放订阅，不持久化第二份主题偏好 |
| 反馈入口形态 | 门户任意子应用可加深链反馈入口（query 预填 `applicationCode`/`contextPath`/`kind=intercepted`），深链参数用户可改可清 |

人员接入沿用既有可信 Web 的 `authorization_code`、S256 PKCE 和 Bearer。公开客户端是浏览器发起授权的身份，不持有机密 Secret；机密（client 凭据）不进本仓、日志与文档。浏览器页面不读取明文令牌、不使用门户 Cookie 调用业务 API、不自行解码令牌推导权限。

## 页面、操作与数据三权

| 页面菜单 | 子应用路径 | PAGE 页面权限 | API 操作权限 | DATA 数据资源与动作 |
| --- | --- | --- | --- | --- |
| 提交反馈 | `/submit` | `feedback.page.submit` | `feedback.submission.create` / `feedback.submission.hint` / `feedback.application.list` | 无 |
| 我的反馈 | `/my` | `feedback.page.my` | `feedback.submission.mine` | owner 等值（本人，非 DATA 投影） |
| 反馈管理 | `/admin` | `feedback.page.admin` | `feedback.submission.read` / `feedback.submission.manage` | `feedback:submission` 的 `read`/`manage`，维度 application（IN 集） |
| 应用注册表 | `/registry` | `feedback.page.registry` | `feedback.application.read` / `feedback.application.manage` | `feedback:application` 的 `read`/`manage`，维度 application |

提交人可见应用下拉=「本人可访问应用 ∩ 注册表启用项」交集，为便利性过滤非安全边界；管理侧行权限由 DATA 三权在服务端强制。授权一律走角色授权规则，避免直接用户授权被角色与权限清单重算覆盖：四个角色=反馈管理员（feedback-admin，全量）、反馈提交人（feedback-submitter，submit/my 两页+提交族四码）、反馈处理人（feedback-handler，admin 页+submission DATA IN 所属应用集）、反馈登记员（feedback-registry-admin，registry 页+application DATA 全集），按部门、用户组等稳定身份关系绑定，四个角色可按实际职责组合兼任。

DATA 资源命名形态以 IAM 登记接口实际接受为准（家族先例 `kms-key` 连字符与 `blueops-falcon-audit:event` 冒号并存，本仓 manifest 暂用冒号形态）。

## 清单与登记顺序

登记对照模板为 `deploy/iam/create-trusted-application.json`，权限清单候选文件为 `deploy/iam/permission-manifest.json`（`roles=[]` 只是不在清单中自动声明角色，实际角色经授权规则表达）。模板中的 `initialClient.clientId` 是占位符，实际公共客户端 ID 只从受控部署环境或 IAM 管理流程取得，不回填仓库、镜像或日志。模板是可核对的完整快照，不替代 IAM 管理 API 写入；登记顺序：

1. 阅实际 IAM 版本及公开管理契约，读取既有 `applicationCode=feedback`，存在则更新不重复创建；确认内置应用目标的正式设置路径。
2. 配置批准的静态入口与 API 同源映射、浏览器公共授权客户端；机密只经部署环境注入。
3. 先保存完整权限清单（PAGE 4 / API 8 / DATA 资源 2，与 manifest 文件一致），再保存门户菜单节点及默认入口；Portal 配置更新带读取到的 `configVersion`，默认入口请求使用 `entryPath` 字段名。
4. 建立准入及角色规则，按已批准稳定身份关系赋权，不按用户编号硬编码；保存完整规则并核验实际投影，确认 Portal `menuTree` 与子应用 `pagePermissions` 同步，避免清空存量授权。
5. 接通正式浏览器授权，真实请求核验人员 Bearer、服务端逐请求准入与失败关闭；撤掉任一 PAGE 后，菜单和对应深链均应进入无权页。
6. 单独批准部署与查询开放。

发布前构建必须显式注入非空 `VITE_FEEDBACK_IAM_CLIENT_ID`，再执行 `npx pnpm@9.15.4 run check` 和 `npx pnpm@9.15.4 run build`。构建生成的 `dist/` 是静态部署目录，按仓库规则忽略，不作为源码提交；发布验收必须通过统一门户的 `/app/feedback/` 和同源 `/api/feedback/`，不能用 Vite 开发服务器、Feedback Java 端口或 Envoy 管理端口替代。

## 验收

验收从 Portal 进入四个页面，按下列矩阵执行（按四类角色准备账号或测试身份：反馈提交人、反馈处理人、反馈登记员、反馈管理员；处理人可再分出只读查看者=授 read 不授 manage）：

1. **提交闭环**：选择应用（下拉=本人可访问 ∩ 注册表启用；hint 失败回退全量不影响提交）→ 类型/打分（1-10）/文本/选填邮箱（IAM 资料预填可改可清）→ 附件（≤3 张 jpg/png/webp，超限前端拦截+服务端 413/415）→ 提交成功提示；错误分支：未登记应用 400、频控 429、附件未开放 400。
2. **我的反馈**：列表仅本人（owner 等值），详情可见 reply 与附件下载；非本人 id 直开 404；mine 形态不出现处理人/内部备注。
3. **管理面（处理人）**：显式查询筛选（应用编码/状态/类型/来源/打分/关键词）+分页，关键词命中反馈内容、提交人展示名或 subjectId 并在查询时生效；DATA 受限账号只见获权应用行（列表遮蔽+详情 404+处理 404 写路径）；处理=状态迁移+内部备注+答复，旧版本再处理 409 提示刷新；终态直迁被拒。
4. **注册表（管理员）**：登记/编辑/启停（停用=新提交拒、历史不受影响）；受限范围外编码登记 403；数据来源徽标 IAM 同源/本表登记/未核对——同源行展示名登记自动抄录 IAM 官方名、编辑置灰且强改 409、"从 IAM 重新同步展示名"按钮可刷新，受理门与处理组不受锁；目录不可核对（adaptor 缺席/出站失败）时全字段可编辑。
5. **撤权**：撤 PAGE 后菜单消失；撤 API 后页面操作 403；撤 DATA 后列表空集（非报错）。
6. **深链**：任意子应用带 `applicationCode/contextPath/kind=intercepted` 深链进入提交页，参数预填且可改可清。

环境快照（ua/viewport/theme/locale）随提交落库，管理详情可查；主题切换后新提交记录新主题值。提交人 displayName 随行快照（聚形态经档案 SPI 取数；降级/散形态回退裸 subjectId 展示），管理列表与详情显示提交人姓名。
