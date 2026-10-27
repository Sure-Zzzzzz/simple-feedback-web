export const pagePermissionByRoute: Record<string, string> = {
  '/submit': 'feedback.page.submit',
  '/my': 'feedback.page.my',
  '/admin': 'feedback.page.admin',
  '/registry': 'feedback.page.registry'
};

export interface PageProjection {
  hasPageProjection: boolean;
  allowedPages: Set<string>;
}

export function resolvePageProjection(poweredByQiankun: boolean, pagePermissions?: string[]): PageProjection {
  const hasPageProjection = Array.isArray(pagePermissions) || !poweredByQiankun;
  const allowedPages = new Set(pagePermissions ?? (poweredByQiankun
    ? []
    : Object.values(pagePermissionByRoute)));
  return { hasPageProjection, allowedPages };
}
