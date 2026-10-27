import { describe, expect, it, vi } from 'vitest';
import {
  beginFeedbackAuthorization,
  clearFeedbackToken,
  feedbackAccessToken,
  feedbackChallengeOf,
  feedbackIdempotencyKey,
  handleFeedbackCallback,
  FEEDBACK_AUTH_DEFAULTS
} from './pkce';

function resetSession(): void {
  window.sessionStorage.clear();
}

describe('FEEDBACK PKCE', () => {
  it('缺少 clientId 时拒绝发起授权且不写入会话', () => {
    resetSession();
    expect(() => beginFeedbackAuthorization('/customers', { clientId: '' }))
      .toThrow('反馈登录配置缺失');
    expect(window.sessionStorage.getItem('feedback.pkce.verifier')).toBeNull();
  });

  it('challenge 是 verifier 的 SHA-256 十六进制（标准向量）', () => {
    // RFC 7636 附录 B 向量：verifier dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
    expect(feedbackChallengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('HTTP 隔离上下文没有 randomUUID 时使用 getRandomValues 生成幂等键', () => {
    vi.stubGlobal('crypto', {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(7);
        return bytes;
      }
    });
    try {
      expect(feedbackIdempotencyKey()).toMatch(/^[A-Za-z0-9_-]+-[A-Za-z0-9_-]+$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('begin 写 verifier/state 并跳转授权端点（S256）', () => {
    resetSession();
    clearFeedbackToken();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, origin: 'http://127.0.0.1:5178' });
    beginFeedbackAuthorization('/customers', { clientId: 'unit-test-only' });
    expect(assign).toHaveBeenCalledTimes(1);
    const url = String(assign.mock.calls[0][0]);
    expect(url).toContain(`${FEEDBACK_AUTH_DEFAULTS.issuer}/oauth2/authorize`);
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('code_challenge=');
    expect(url).toContain(encodeURIComponent('http://127.0.0.1:5178/app/feedback/oauth-callback'));
    expect(window.sessionStorage.getItem('feedback.pkce.verifier')).toBeTruthy();
    expect(window.sessionStorage.getItem('feedback.pkce.state'))
      .toMatch(/^feedback\.pkce\.[A-Za-z0-9_-]{32}\.\/customers$/);
    vi.unstubAllGlobals();
  });

  it('issuer 带尾斜杠时授权与令牌端点仍保持单斜杠', async () => {
    resetSession();
    const issuer = 'https://iam.example.test///';
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, origin: 'http://127.0.0.1:5178' });
    beginFeedbackAuthorization('/customers', { issuer, clientId: 'unit-test-only' });
    expect(String(assign.mock.calls[0][0])).toContain('https://iam.example.test/oauth2/authorize');
    expect(String(assign.mock.calls[0][0])).not.toContain('https://iam.example.test///oauth2');

    window.sessionStorage.setItem('feedback.pkce.verifier', 'test-verifier');
    const state = window.sessionStorage.getItem('feedback.pkce.state');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'token-issuer', expires_in: 3600 })
    });
    vi.stubGlobal('fetch', fetchMock);
    await handleFeedbackCallback(`?code=abc&state=${encodeURIComponent(state ?? '')}`, {
      issuer,
      clientId: 'unit-test-only'
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://iam.example.test/oauth2/token');
    vi.unstubAllGlobals();
  });

  it.each([
    ['缺失', undefined],
    ['抛错', { getRandomValues: () => { throw new Error('unavailable'); } }]
  ])('安全随机源%s时拒绝授权且不使用 Math.random', (_case, randomSource) => {
    resetSession();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    vi.stubGlobal('crypto', randomSource);
    const insecureRandom = vi.spyOn(Math, 'random');
    try {
      expect(() => beginFeedbackAuthorization('/customers', { clientId: 'unit-test-only' }))
        .toThrow('安全随机数不可用');
      expect(insecureRandom).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem('feedback.pkce.verifier')).toBeNull();
      expect(window.sessionStorage.getItem('feedback.pkce.state')).toBeNull();
    } finally {
      insecureRandom.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('callback 换令牌成功后清除 verifier 并返回目标路由', async () => {
    resetSession();
    window.sessionStorage.setItem('feedback.pkce.verifier', 'test-verifier');
    window.sessionStorage.setItem('feedback.pkce.state', 'feedback.pkce.1./orders');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'token-1', expires_in: 3600 })
    });
    vi.stubGlobal('fetch', fetchMock);
    const outcome = await handleFeedbackCallback('?code=abc&state=' + encodeURIComponent('feedback.pkce.1./orders'),
      { clientId: 'unit-test-only' });
    expect(outcome.kind === 'authorized' && outcome.target).toBe('/orders');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/oauth2/token');
    expect(String(init.body)).toContain('code_verifier=test-verifier');
    expect(feedbackAccessToken()).toBe('token-1');
    expect(window.sessionStorage.getItem('feedback.pkce.verifier')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('state 不匹配拒绝', async () => {
    resetSession();
    window.sessionStorage.setItem('feedback.pkce.verifier', 'v');
    window.sessionStorage.setItem('feedback.pkce.state', 'expected');
    const outcome = await handleFeedbackCallback('?code=abc&state=other');
    expect(outcome.kind).toBe('state-mismatch');
  });
});
