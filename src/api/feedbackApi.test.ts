import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FeedbackApiError,
  configureFeedbackApi,
  downloadMyAttachment,
  fetchSubmissionHint,
  listMySubmissions,
  listApplications,
  setFeedbackUnauthorizedHandler
} from './feedbackApi';

afterEach(() => {
  vi.unstubAllGlobals();
  setFeedbackUnauthorizedHandler(null);
  configureFeedbackApi('/api/feedback');
});

describe('Feedback API 错误响应', () => {
  it('服务端 500 原文不进入页面错误消息，仍保留定位信息', async () => {
    const parseBody = vi.fn().mockResolvedValue({ message: 'IllegalStateException: internal detail' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'X-Correlation-Id': 'request-1' }),
      json: parseBody
    }));

    await expect(listApplications()).rejects.toMatchObject({
      message: '服务暂不可用，请稍后重试（请求 ID：request-1）',
      status: 500,
      correlationId: 'request-1'
    });
    expect(parseBody).not.toHaveBeenCalled();
  });

  it('异常请求 ID 不进入错误提示', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers({ 'X-Correlation-Id': 'bad id with spaces' })
    }));

    await expect(listApplications()).rejects.toMatchObject({
      message: '服务暂不可用，请稍后重试',
      correlationId: null
    });
  });

  it('仅展示与响应头关联的反馈业务错误消息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers({ 'X-Correlation-Id': 'request-2' }),
      json: async () => ({
        message: '应用已登记',
        timestamp: '2026-10-15T00:00:00Z',
        correlationId: 'request-2'
      })
    }));

    await expect(listApplications()).rejects.toMatchObject({
      message: '应用已登记',
      status: 409,
      correlationId: 'request-2'
    });
  });

  it('旧版或宿主错误体不能透传异常原文', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({ message: 'IllegalArgumentException: invalid query' })
    }));

    const failure = listApplications();
    await expect(failure).rejects.toBeInstanceOf(FeedbackApiError);
    await expect(failure).rejects.toMatchObject({ message: '请求失败: 400' });
  });

  it('401 继续触发重新授权', async () => {
    const unauthorized = vi.fn();
    setFeedbackUnauthorizedHandler(unauthorized);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(listApplications()).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it('401 保留请求关联 ID', async () => {
    const unauthorized = vi.fn();
    setFeedbackUnauthorizedHandler(unauthorized);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'X-Correlation-Id': 'request-3' })
    }));

    await expect(listApplications()).rejects.toMatchObject({
      status: 401,
      correlationId: 'request-3'
    });
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it('附件下载沿用 401 重新授权与请求关联 ID', async () => {
    const unauthorized = vi.fn();
    setFeedbackUnauthorizedHandler(unauthorized);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'X-Correlation-Id': 'request-4' })
    }));

    await expect(downloadMyAttachment('submission-1', 'attachment-1', 'screen.png')).rejects.toMatchObject({
      status: 401,
      correlationId: 'request-4'
    });
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it('我的反馈列表使用契约路径并对关键词做 URL 编码', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ items: [], total: 0, page: 1, size: 20 })
    });
    vi.stubGlobal('fetch', fetchMock);

    await listMySubmissions(1, 20, '100% bug');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/feedback/me/submissions?page=1&size=20&keyword=100%25+bug',
      expect.objectContaining({ credentials: 'omit' })
    );
  });

  it('API 基址带尾斜杠时不会拼出双斜杠', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ applications: [], contactEmail: null })
    });
    vi.stubGlobal('fetch', fetchMock);

    configureFeedbackApi(' /api/feedback/// ');
    await fetchSubmissionHint();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/feedback/submission-hints',
      expect.objectContaining({ credentials: 'omit' })
    );
  });
});
