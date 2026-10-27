// 共享展示层：枚举值中文转换、时间格式化、应用编码→展示名映射。
// 此前列表/处理框直接渲染英文枚举与应用编码、详情页各写一套中文映射，展示规则不统一——
// 本模块是唯一转换源，各视图一律引用，禁止再落本地副本。
import { ref, type Ref } from 'vue';
import { fetchSelectableApplications } from './api/feedbackApi';

const TYPE_TEXT: Record<string, string> = {
  bug: '缺陷报告',
  feature: '功能建议',
  experience: '体验问题',
  other: '其他'
};

const KIND_TEXT: Record<string, string> = {
  proactive: '主动发起',
  intercepted: '错误场景'
};

const STATUS_TEXT: Record<string, string> = {
  submitted: '已提交',
  resolved: '已解决',
  dismissed: '不予处理'
};

export function typeText(type: string): string {
  return TYPE_TEXT[type] || type;
}

export function kindText(kind: string): string {
  return KIND_TEXT[kind] || kind;
}

export function statusText(status: string): string {
  return STATUS_TEXT[status] || status;
}

export function statusBadgeTone(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'resolved') {
    return 'success';
  }
  return status === 'submitted' ? 'warning' : 'neutral';
}

/** 提交人展示：优先显示名快照，缺失回退数字编号，两者皆空给占位符。 */
export function submitterText(displayName: string | null, subjectId: string | null): string {
  return displayName || subjectId || '—';
}

export function formatTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

// 应用编码→展示名映射：与提交页下拉同源（selectable-applications），
// 全应用共享一份、取一次缓存；取数失败回退显示编码（命名是展示增强，不阻塞列表）。
const applicationNames = ref<Record<string, string>>({});
let warmStarted = false;

/** 预热应用名映射（幂等；失败后允许下次进入页面重试）。 */
export function useApplicationNames(): Ref<Record<string, string>> {
  if (!warmStarted) {
    warmStarted = true;
    fetchSelectableApplications()
      .then(list => {
        applicationNames.value = Object.fromEntries(
          list.map(item => [item.applicationCode, item.displayName || item.applicationCode])
        );
      })
      .catch(() => {
        warmStarted = false;
      });
  }
  return applicationNames;
}

/** 应用列文本：有映射时「展示名（编码）」，无映射显示编码原文。 */
export function applicationText(names: Record<string, string>, code: string): string {
  const name = names[code];
  return name && name !== code ? `${name}（${code}）` : code;
}
