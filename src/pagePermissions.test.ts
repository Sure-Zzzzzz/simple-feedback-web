import { describe, expect, it } from 'vitest';
import { resolvePageProjection } from './pagePermissions';

describe('Feedback PAGE 投影', () => {
  it('standalone 开发态缺省投影时保留全部页面', () => {
    const projection = resolvePageProjection(false);
    expect(projection.hasPageProjection).toBe(true);
    expect(projection.allowedPages).toEqual(new Set([
      'feedback.page.submit', 'feedback.page.my', 'feedback.page.admin', 'feedback.page.registry'
    ]));
  });

  it('qiankun 挂载缺少投影时不放行页面', () => {
    const projection = resolvePageProjection(true);
    expect(projection.hasPageProjection).toBe(false);
    expect(projection.allowedPages).toEqual(new Set());
  });

  it('qiankun 挂载只保留门户投影的权限', () => {
    const projection = resolvePageProjection(true, ['feedback.page.admin']);
    expect(projection.hasPageProjection).toBe(true);
    expect(projection.allowedPages).toEqual(new Set(['feedback.page.admin']));
  });
});
