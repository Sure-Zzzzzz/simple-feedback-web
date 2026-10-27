import { createApp, type App as VueApp } from 'vue';
import { createRouter, createWebHistory, type Router } from 'vue-router';
import { qiankunWindow, renderWithQiankun } from 'vite-plugin-qiankun/dist/helper';
import {
  applyTheme,
  createLightThemePreference,
  type ThemeSnapshot
} from '@sure-zzzzzz/simple-iam-theme-contract';
import '@sure-zzzzzz/simple-iam-theme-contract/theme.css';
import App from './App.vue';
import { beginFeedbackAuthorization, feedbackAccessToken } from './auth/pkce';
import { configureFeedbackApi, setFeedbackUnauthorizedHandler } from './api/feedbackApi';
import SubmitView from './view/SubmitView.vue';
import MyFeedbackView from './view/MyFeedbackView.vue';
import AdminView from './view/AdminView.vue';
import RegistryView from './view/RegistryView.vue';
import OAuthCallbackView from './view/OAuthCallbackView.vue';
import ForbiddenView from './view/ForbiddenView.vue';
import { themeState } from './themeState';
import { pagePermissionByRoute, resolvePageProjection } from './pagePermissions';
import './style.css';

let app: VueApp<Element> | null = null;
let router: Router | null = null;
let root: HTMLElement | null = null;
let releaseTheme = () => undefined as void;

interface MountProps {
  container?: Element | Document;
  routePrefix?: string;
  apiBase?: string;
  /** Portal 已按当前身份裁剪后的 PAGE 权限；standalone 开发态不传此属性。 */
  pagePermissions?: string[];
  theme?: { current(): ThemeSnapshot; subscribe(listener: (snapshot: ThemeSnapshot) => void): () => void };
}

function createFeedbackRouter(base: string, pagePermissions?: string[]) {
  const portalMount = Boolean(qiankunWindow.__POWERED_BY_QIANKUN__);
  const { hasPageProjection, allowedPages } = resolvePageProjection(portalMount, pagePermissions);
  const instance = createRouter({
    history: createWebHistory(base),
    routes: [
      { path: '/', redirect: '/submit' },
      { path: '/submit', component: SubmitView },
      { path: '/my', component: MyFeedbackView },
      { path: '/admin', component: AdminView },
      // 兼容旧详情深链，但统一由管理页的契约 Drawer 承载详情。
      { path: '/admin/:id', redirect: to => ({ path: '/admin', query: { detail: String(to.params.id) } }) },
      { path: '/registry', component: RegistryView },
      { path: '/oauth-callback', component: OAuthCallbackView },
      { path: '/403', component: ForbiddenView },
      { path: '/:pathMatch(.*)*', redirect: '/submit' }
    ]
  });
  instance.beforeEach(to => {
    if (to.path === '/oauth-callback') {
      return true;
    }
    if (to.path === '/403') {
      return true;
    }
    if (!feedbackAccessToken()) {
      beginFeedbackAuthorization(to.fullPath);
      return false;
    }
    if (portalMount && !hasPageProjection) {
      return '/403';
    }
    const requiredPermission = pagePermissionByRoute[to.path];
    if (hasPageProjection && requiredPermission && !allowedPages.has(requiredPermission)) {
      return '/403';
    }
    if (hasPageProjection && to.path === '/') {
      const firstAllowedRoute = Object.entries(pagePermissionByRoute)
        .find(([, permission]) => allowedPages.has(permission))?.[0];
      return firstAllowedRoute ?? '/403';
    }
    return true;
  });
  return instance;
}

function applyFeedbackTheme(props: MountProps): void {
  releaseTheme();
  releaseTheme = () => undefined as void;
  if (root) {
    const initial = props.theme?.current() ?? createLightThemePreference();
    applyTheme(root, initial);
    themeState.currentName = initial.mode;
    if (props.theme) {
      releaseTheme = props.theme.subscribe(snapshot => {
        if (root) {
          applyTheme(root, snapshot);
          themeState.currentName = snapshot.mode;
        }
      });
    }
  }
}

function render(props: MountProps = {}) {
  router = createFeedbackRouter(qiankunWindow.__POWERED_BY_QIANKUN__
    ? `${props.routePrefix || '/app/feedback'}/`
    : '/app/feedback/', props.pagePermissions);
  configureFeedbackApi(props.apiBase ?? '/api/feedback');
  setFeedbackUnauthorizedHandler(() => {
    if (router) {
      beginFeedbackAuthorization(router.currentRoute.value.fullPath);
    }
  });
  app = createApp(App);
  app.use(router);
  const container = props.container?.querySelector('#app') || document.querySelector('#app');
  if (container instanceof HTMLElement) {
    app.mount(container);
    root = container;
    applyFeedbackTheme(props);
  }
}

renderWithQiankun({
  bootstrap() {},
  mount(props) {
    render(props as MountProps);
  },
  unmount() {
    releaseTheme();
    releaseTheme = () => undefined as void;
    setFeedbackUnauthorizedHandler(null);
    app?.unmount();
    app = null;
    router = null;
    root = null;
  },
  update(props) {
    applyFeedbackTheme(props as MountProps);
  }
});

if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render();
}
