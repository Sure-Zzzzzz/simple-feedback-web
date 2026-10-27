// Feedback Server REST API 客户端：PKCE 令牌自动附带、401 触发重新授权回调。
import { feedbackAccessToken } from '../auth/pkce';

export class FeedbackApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly correlationId: string | null = null
  ) {
    super(message);
    this.name = 'FeedbackApiError';
  }
}

export interface FeedbackPage<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface FeedbackAttachmentMeta {
  id: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
}

export interface FeedbackSubmissionSummary {
  id: string;
  applicationCode: string;
  kind: string;
  type: string;
  score: number;
  content: string;
  contactEmail: string | null;
  submitterDisplayName: string | null;
  status: string;
  contextPath: string | null;
  reply: string | null;
  repliedAt: string | null;
  handledAt: string | null;
  rowVersion: number;
  attachments: FeedbackAttachmentMeta[];
  createdTime: string;
}

export interface FeedbackSubmissionAdmin extends FeedbackSubmissionSummary {
  submitterSubjectId: string | null;
  handlerNote: string | null;
}

export interface FeedbackApplicationInfo {
  applicationCode: string;
  displayName: string;
  description: string | null;
  enabled: boolean;
  ownerGroup: string | null;
  rowVersion: number;
  createdTime: string;
  updatedTime: string;
  /** 数据来源：IAM=与 IAM 可信应用同编码（展示名 IAM 承担）；MANUAL=本表登记；UNKNOWN=目录不可核对 */
  source?: 'IAM' | 'MANUAL' | 'UNKNOWN' | null;
}

/** `/selectable-applications` 的精简应用条目，不包含注册表管理字段。 */
export interface SelectableApplicationInfo {
  applicationCode: string;
  displayName: string | null;
  description: string | null;
}

export interface SubmissionHintApplication {
  applicationCode: string;
  displayName: string | null;
  description: string | null;
}

export interface SubmissionHint {
  applications: SubmissionHintApplication[];
  contactEmail: string | null;
}

function normalizeApiBase(base: string): string {
  return base.trim().replace(/\/+$/, '');
}

let apiBase = normalizeApiBase('/api/feedback');
let unauthorizedHandler: (() => void) | null = null;

/** 配置 API 基址（qiankun mount props.apiBase 或同源默认）。 */
export function configureFeedbackApi(base: string): void {
  apiBase = normalizeApiBase(base);
}

/** 注册 401 回调（触发重新授权）。 */
export function setFeedbackUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function responseCorrelationId(response: Response): string | null {
  const headerId = response.headers?.get('X-Correlation-Id');
  return headerId && CORRELATION_ID_PATTERN.test(headerId) ? headerId : null;
}

function unauthorizedError(response: Response): FeedbackApiError {
  return new FeedbackApiError('未认证或会话过期', 401, responseCorrelationId(response));
}

async function responseError(response: Response, fallbackPrefix = '请求失败'): Promise<FeedbackApiError> {
  const correlationId = responseCorrelationId(response);
  if (response.status >= 500) {
    const message = correlationId
      ? `服务暂不可用，请稍后重试（请求 ID：${correlationId}）`
      : '服务暂不可用，请稍后重试';
    return new FeedbackApiError(message, response.status, correlationId);
  }
  let message = `${fallbackPrefix}: ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const error = body as Record<string, unknown>;
      if (correlationId && error.correlationId === correlationId
        && typeof error.timestamp === 'string'
        && typeof error.message === 'string'
        && error.message.trim().length > 0
        && error.message.length <= 200) {
        message = error.message;
      }
    }
  } catch {
    // 非反馈错误体：保留状态码消息
  }
  return new FeedbackApiError(message, response.status, correlationId);
}

async function requestBlob(path: string): Promise<Blob> {
  const token = feedbackAccessToken();
  const response = await fetch(`${apiBase}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'omit'
  });
  if (response.status === 401) {
    if (unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw unauthorizedError(response);
  }
  if (!response.ok) {
    throw await responseError(response, '附件下载失败');
  }
  return response.blob();
}

async function saveAttachment(path: string, filename: string): Promise<void> {
  const blob = await requestBlob(path);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 浏览器可能异步启动下载，等点击事件消费后再释放对象 URL。
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = feedbackAccessToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: 'omit' });
  if (response.status === 401) {
    if (unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw unauthorizedError(response);
  }
  if (!response.ok) {
    throw await responseError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** 提交提示（交集后应用清单+邮箱预填）。 */
export function fetchSubmissionHint(): Promise<SubmissionHint> {
  return request<SubmissionHint>('/submission-hints');
}

/** 可选应用列表（启用中注册项）。 */
export function fetchSelectableApplications(): Promise<SelectableApplicationInfo[]> {
  return request<SelectableApplicationInfo[]>('/selectable-applications');
}

export interface CreateSubmissionInput {
  applicationCode: string;
  kind: 'proactive' | 'intercepted';
  type: 'bug' | 'feature' | 'experience' | 'other';
  score: number;
  content: string;
  contactEmail: string | null;
  contextPath: string | null;
  environment: Record<string, string> | null;
  files: File[];
}

/** 提交反馈（multipart；幂等键由调用方管理——失败重试复用同键，成功后轮换）。 */
export function createSubmission(input: CreateSubmissionInput, idempotencyKey: string): Promise<FeedbackSubmissionSummary> {
  const form = new FormData();
  const submission = {
    applicationCode: input.applicationCode,
    kind: input.kind,
    type: input.type,
    score: input.score,
    content: input.content,
    contactEmail: input.contactEmail,
    contextPath: input.contextPath,
    environment: input.environment ? JSON.stringify(input.environment) : null
  };
  form.append('submission', new Blob([JSON.stringify(submission)], { type: 'application/json' }));
  for (const file of input.files) {
    form.append('attachments', file, file.name);
  }
  return request<FeedbackSubmissionSummary>('/submissions', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: form
  });
}

export interface AdminListQuery {
  application?: string;
  status?: string;
  type?: string;
  kind?: string;
  score?: number;
  /** 关键词：命中反馈内容或提交人展示名（服务端上限 64 字符） */
  keyword?: string;
  page?: number;
  size?: number;
}

function toQueryString(query: AdminListQuery): string {
  const params = new URLSearchParams();
  if (query.application) params.set('application', query.application);
  if (query.status) params.set('status', query.status);
  if (query.type) params.set('type', query.type);
  if (query.kind) params.set('kind', query.kind);
  if (query.score !== undefined) params.set('score', String(query.score));
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.size !== undefined) params.set('size', String(query.size));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** 管理列表。 */
export function listSubmissions(query: AdminListQuery = {}): Promise<FeedbackPage<FeedbackSubmissionAdmin>> {
  return request<FeedbackPage<FeedbackSubmissionAdmin>>(`/submissions${toQueryString(query)}`);
}

/** 管理详情。 */
export function getSubmission(id: string): Promise<FeedbackSubmissionAdmin> {
  return request<FeedbackSubmissionAdmin>(`/submissions/${encodeURIComponent(id)}`);
}

export interface HandlingInput {
  targetStatus: 'submitted' | 'resolved' | 'dismissed';
  handlerNote: string | null;
  reply: string | null;
  expectedRowVersion: number;
}

/** 处理反馈（状态+备注+回复整体覆盖；行版本 CAS）。 */
export function handleSubmission(id: string, input: HandlingInput): Promise<FeedbackSubmissionAdmin> {
  return request<FeedbackSubmissionAdmin>(`/submissions/${encodeURIComponent(id)}/handling`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
}

/** 我的反馈列表。 */
export function listMySubmissions(
  page = 1,
  size = 20,
  keyword?: string
): Promise<FeedbackPage<FeedbackSubmissionSummary>> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (keyword) params.set('keyword', keyword);
  return request<FeedbackPage<FeedbackSubmissionSummary>>(`/me/submissions?${params.toString()}`);
}

/** 我的反馈详情。 */
export function getMySubmission(id: string): Promise<FeedbackSubmissionSummary> {
  return request<FeedbackSubmissionSummary>(`/me/submissions/${encodeURIComponent(id)}`);
}

/** 管理侧附件下载（服务端代理流；DATA 范围内）。 */
export function downloadAdminAttachment(id: string, attachmentId: string, filename: string): Promise<void> {
  return saveAttachment(
    `/submissions/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
    filename
  );
}

export async function downloadMyAttachment(id: string, attachmentId: string, filename: string): Promise<void> {
  await saveAttachment(
    `/me/submissions/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
    filename
  );
}

/** 注册表全量列表（管理）。 */
export function listApplications(): Promise<FeedbackApplicationInfo[]> {
  return request<FeedbackApplicationInfo[]>('/applications');
}

/** 注册应用请求；applicationCode 与 displayName 是创建时的必填字段。 */
export interface ApplicationCreateInput {
  applicationCode: string;
  displayName: string;
  description?: string | null;
  enabled?: boolean;
  ownerGroup?: string | null;
}

/** 注册应用更新请求；expectedRowVersion 是服务端 CAS 必填字段。 */
export interface ApplicationUpdateInput {
  displayName?: string | null;
  description?: string | null;
  enabled?: boolean;
  ownerGroup?: string | null;
  expectedRowVersion: number;
  /** 从 IAM 目录重同步展示名（仅同源行生效） */
  syncFromIam?: boolean;
}

/** 注册表编辑表单的兼容形态；实际请求使用创建/更新专用类型。 */
export interface ApplicationUpsertInput {
  applicationCode?: string;
  displayName: string;
  description: string | null;
  enabled: boolean;
  ownerGroup: string | null;
  expectedRowVersion?: number;
  /** 从 IAM 目录重同步展示名（仅同源行生效） */
  syncFromIam?: boolean;
}

/** 登记应用。 */
export function createApplication(input: ApplicationCreateInput): Promise<FeedbackApplicationInfo> {
  return request<FeedbackApplicationInfo>('/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
}

/** 更新注册项（行版本 CAS）。 */
export function updateApplication(
  applicationCode: string,
  input: ApplicationUpdateInput
): Promise<FeedbackApplicationInfo> {
  return request<FeedbackApplicationInfo>(`/applications/${encodeURIComponent(applicationCode)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
}
