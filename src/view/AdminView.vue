<template>
  <main class="feedback-page">
    <PageHeader title="反馈管理" description="按获权模块查看与处理反馈" />
    <section class="feedback-panel">
      <div class="feedback-filter">
        <input v-model="filter.application" class="feedback-input" maxlength="64"
               placeholder="应用编码" @keyup.enter="search" />
        <FormSelect v-model="filter.status" :options="statusOptions" aria-label="状态筛选" />
        <FormSelect v-model="filter.type" :options="typeOptions" aria-label="类型筛选" />
        <FormSelect v-model="filter.kind" :options="kindOptions" aria-label="来源筛选" />
        <FormSelect v-model="filter.score" :options="scoreOptions" aria-label="打分筛选" />
        <input v-model="filter.keyword" class="feedback-input" maxlength="64"
               placeholder="搜索反馈内容 / 提交人" @keyup.enter="search" />
        <div class="feedback-filter-actions">
          <button type="button" class="button-primary feedback-primary" @click="search">查询</button>
          <button type="button" class="button-secondary" @click="resetFilters">重置</button>
        </div>
      </div>

      <p v-if="loadError" class="feedback-message is-error">
        {{ loadError }}
        <button type="button" class="feedback-link" @click="load(page.page)">重试</button>
      </p>
      <DataTable v-else class="feedback-sticky-actions" :columns="columns" :rows="page.items" row-key="id"
                 scroll-min-width="1220px" :loading="loading" empty-text="当前筛选与授权范围内暂无反馈。">
        <template #cell-applicationCode="{ row }">{{ applicationText(appNames, row.applicationCode) }}</template>
        <template #cell-kind="{ row }">{{ kindText(row.kind) }}</template>
        <template #cell-type="{ row }">{{ typeText(row.type) }}</template>
        <template #cell-content="{ row }">
          <span class="feedback-content-preview" :title="row.content">{{ row.content }}</span>
        </template>
        <template #cell-status="{ row }">
          <span class="status-badge feedback-status-badge" :class="statusBadgeTone(row.status)">
            {{ statusText(row.status) }}
          </span>
        </template>
        <template #cell-submitter="{ row }">
          {{ submitterText(row.submitterDisplayName, row.submitterSubjectId) }}
        </template>
        <template #cell-attachments="{ row }">
          <template v-if="row.attachments.length">
            <button
              v-for="attachment in row.attachments"
              :key="attachment.id"
              type="button"
              class="feedback-link"
              :disabled="loading"
              @click="download(row, attachment)"
            >
              {{ attachment.originalFilename }}
            </button>
          </template>
          <template v-else>—</template>
        </template>
        <template #cell-createdTime="{ row }">{{ formatTime(row.createdTime) }}</template>
        <template #cell-actions="{ row }">
          <div class="feedback-table-actions">
            <button type="button" class="table-action" :disabled="loading" @click="openDetail(row.id)">详情</button>
            <button type="button" class="table-action" :disabled="loading" @click="openHandling(row)">处理</button>
          </div>
        </template>
      </DataTable>
      <p v-if="loading && page.items.length" class="feedback-hint" role="status">正在更新列表…</p>

      <Pagination v-if="page.total > 0" :current="page.page" :page-size="page.size" :total="page.total"
                  @update:current="goPage" @update:page-size="changePageSize" />

      <p v-if="deepLinkError" class="feedback-message is-error">{{ deepLinkError }}</p>

      <Drawer
        :open="detailLoading || detail !== null || Boolean(detailError)"
        title="反馈详情"
        :description="detail ? `${applicationText(appNames, detail.applicationCode)} · ${statusText(detail.status)}` : '读取反馈详情'"
        :pending="detailLoading"
        @close="closeDetail"
      >
        <div class="feedback-drawer-stack">
          <p v-if="detailLoading" class="feedback-hint" role="status">正在读取反馈详情…</p>
          <p v-if="detailError" class="feedback-message is-error" role="alert">
            {{ detailError }}
            <button type="button" class="feedback-link" :disabled="detailLoading" @click="retryDetail">重试</button>
          </p>
          <template v-if="detail">
            <dl class="feedback-detail-grid">
              <div><dt>提交人</dt><dd>{{ submitterText(detail.submitterDisplayName, detail.submitterSubjectId) }}</dd></div>
              <div><dt>打分</dt><dd>{{ detail.score }} / 10</dd></div>
              <div><dt>类型</dt><dd>{{ typeText(detail.type) }}</dd></div>
              <div><dt>来源</dt><dd>{{ kindText(detail.kind) }}</dd></div>
              <div><dt>状态</dt><dd><span class="status-badge feedback-status-badge" :class="statusBadgeTone(detail.status)">{{ statusText(detail.status) }}</span></dd></div>
              <div><dt>联系邮箱</dt><dd>{{ detail.contactEmail || '未留' }}</dd></div>
              <div><dt>页面上下文</dt><dd>{{ detail.contextPath || '—' }}</dd></div>
              <div><dt>提交时间</dt><dd>{{ formatTime(detail.createdTime) }}</dd></div>
            </dl>
            <div class="feedback-detail-block">
              <h3>反馈内容</h3>
              <p class="feedback-content">{{ detail.content }}</p>
            </div>
            <div v-if="detail.attachments.length" class="feedback-detail-block">
              <h3>附件</h3>
              <div class="feedback-attachment-list">
                <button v-for="attachment in detail.attachments" :key="attachment.id" type="button"
                        class="feedback-link" @click="download(detail, attachment)">
                  {{ attachment.originalFilename }}（{{ Math.round(attachment.sizeBytes / 1024) }}KB）
                </button>
              </div>
            </div>
            <div v-if="detail.handlerNote || detail.handledAt" class="feedback-detail-block">
              <h3>处理留痕</h3>
              <p class="feedback-muted">{{ detail.handledAt ? formatTime(detail.handledAt) : '' }} · 行版本 {{ detail.rowVersion }}</p>
              <p class="feedback-content">{{ detail.handlerNote || '（无备注）' }}</p>
            </div>
            <div v-if="detail.reply" class="feedback-detail-block">
              <h3>给提交人的答复</h3>
              <p class="feedback-content">{{ detail.reply }}</p>
            </div>
            <div class="drawer-actions">
              <button type="button" class="button-secondary" @click="closeDetail">关闭</button>
              <button type="button" class="button-primary feedback-primary" @click="openHandlingFromDetail">处理此反馈</button>
            </div>
          </template>
        </div>
      </Drawer>

      <Drawer
        :open="handling !== null"
        :title="handling ? '处理反馈' : ''"
        :description="handling ? `${applicationText(appNames, handling.applicationCode)} · ${statusText(handling.status)}` : undefined"
        :pending="handlingSubmitting"
        @close="closeHandling"
      >
        <form v-if="handling" class="drawer-form" @submit.prevent="submitHandling">
          <p class="feedback-muted">提交人：{{ submitterText(handling.submitterDisplayName, handling.submitterSubjectId) }}
            ｜ 打分：{{ handling.score }} ｜ 类型：{{ typeText(handling.type) }} ｜ 邮箱：{{ handling.contactEmail || '未留' }}</p>
          <p class="feedback-content">{{ handling.content }}</p>
          <label class="feedback-field">
            <span class="feedback-label">目标状态</span>
            <FormSelect v-model="handlingForm.targetStatus" :options="handlingStatusOptions"
                        aria-label="目标状态" :disabled="handlingSubmitting" />
          </label>
          <label class="feedback-field">
            <span class="feedback-label">内部备注（管理员可见，整体覆盖）</span>
            <textarea v-model="handlingForm.handlerNote" class="feedback-input" rows="2" maxlength="1000"
                      :disabled="handlingSubmitting" />
          </label>
          <label class="feedback-field">
            <span class="feedback-label">给提交人的回复（提交人在我的反馈可见）</span>
            <textarea v-model="handlingForm.reply" class="feedback-input" rows="2" maxlength="1000"
                      :disabled="handlingSubmitting" />
          </label>
          <p v-if="handlingMessage" class="feedback-message is-error" role="alert">{{ handlingMessage }}</p>
          <div class="drawer-actions">
            <button type="button" class="button-secondary" :disabled="handlingSubmitting" @click="closeHandling">取消</button>
            <button type="submit" class="button-primary feedback-primary" :disabled="handlingSubmitting">
              {{ handlingSubmitting ? '保存中…' : '保存处理' }}
            </button>
          </div>
        </form>
      </Drawer>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@sure-zzzzzz/simple-iam-theme-contract/PageHeader';
import DataTable, { type DataTableColumn } from '@sure-zzzzzz/simple-iam-theme-contract/DataTable';
import Pagination from '@sure-zzzzzz/simple-iam-theme-contract/Pagination';
import Drawer from '@sure-zzzzzz/simple-iam-theme-contract/Drawer';
import FormSelect, { type FormSelectOption } from '@sure-zzzzzz/simple-iam-theme-contract/FormSelect';
import {
  downloadAdminAttachment,
  getSubmission,
  handleSubmission,
  listSubmissions,
  type FeedbackAttachmentMeta,
  type FeedbackPage,
  type FeedbackSubmissionAdmin
} from '../api/feedbackApi';
import {
  applicationText,
  formatTime,
  kindText,
  statusBadgeTone,
  statusText,
  submitterText,
  typeText,
  useApplicationNames
} from '../display';

interface AdminRow extends FeedbackSubmissionAdmin {
  submitter: string;
  actions: string;
}

const columns: DataTableColumn[] = [
  { key: 'applicationCode', label: '模块', width: '160px' },
  { key: 'submitter', label: '提交人', width: '110px' },
  { key: 'kind', label: '来源', width: '95px', nowrap: true },
  { key: 'type', label: '类型', width: '90px', nowrap: true },
  { key: 'score', label: '打分', width: '55px', nowrap: true },
  { key: 'content', label: '内容', width: '310px' },
  { key: 'status', label: '状态', width: '90px', nowrap: true },
  { key: 'createdTime', label: '提交时间', width: '150px', nowrap: true },
  { key: 'actions', label: '操作', width: '160px', nowrap: true }
];

const statusOptions: FormSelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'submitted', label: '已提交' },
  { value: 'resolved', label: '已解决' },
  { value: 'dismissed', label: '不予处理' }
];
const typeOptions: FormSelectOption[] = [
  { value: '', label: '全部类型' },
  { value: 'bug', label: '缺陷报告' },
  { value: 'feature', label: '功能建议' },
  { value: 'experience', label: '体验问题' },
  { value: 'other', label: '其他' }
];
const kindOptions: FormSelectOption[] = [
  { value: '', label: '全部来源' },
  { value: 'proactive', label: '主动发起' },
  { value: 'intercepted', label: '错误场景' }
];
const scoreOptions: FormSelectOption[] = [
  { value: '', label: '全部打分' },
  ...Array.from({ length: 10 }, (_, index) => ({ value: index + 1, label: `${index + 1} 分` }))
];
const handlingStatusOptions: FormSelectOption[] = [
  { value: 'resolved', label: '已解决' },
  { value: 'dismissed', label: '不予处理' },
  { value: 'submitted', label: '重开（回到已提交）' }
];

const filter = reactive({ application: '', status: '', type: '', kind: '', score: '' as number | '', keyword: '' });
// 最近一次「查询」生效的筛选快照：翻页/页大小/处理保存后的刷新都用它——
// 下拉与关键词只改 filter 不发请求，未点查询的改动不得随翻页悄悄生效（显式查询语义）
const applied = reactive({ application: '', status: '', type: '', kind: '', score: '' as number | '', keyword: '' });
const loadError = ref('');
const loading = ref(true);
const deepLinkError = ref('');
const appNames = useApplicationNames();
const page = reactive<FeedbackPage<AdminRow>>({ items: [], total: 0, page: 1, size: 20 });
const detail = ref<FeedbackSubmissionAdmin | null>(null);
const detailId = ref('');
const detailLoading = ref(false);
const detailError = ref('');
const handling = ref<FeedbackSubmissionAdmin | null>(null);
const handlingForm = reactive({
  targetStatus: 'resolved' as 'submitted' | 'resolved' | 'dismissed',
  handlerNote: '',
  reply: ''
});
const handlingMessage = ref('');
const handlingSubmitting = ref(false);
const router = useRouter();
const route = useRoute();
let detailSequence = 0;

function openDetail(id: string): void {
  if (route.query.detail === id) {
    void loadDetail(id);
  } else {
    void router.push({ path: '/admin', query: { detail: id } });
  }
}

onMounted(async () => {
  await load(1);
  syncDetailFromRoute(route.query.detail);
  await consumeHandlingDeepLink();
});

watch(
  () => route.query.detail,
  detailQuery => syncDetailFromRoute(detailQuery)
);

function syncDetailFromRoute(value: unknown): void {
  const id = typeof value === 'string' ? value : '';
  if (!id) {
    if (detailId.value || detail.value || detailError.value || detailLoading.value) {
      clearDetailState();
    }
    return;
  }
  if (id !== detailId.value || (!detailLoading.value && !detail.value && !detailError.value)) {
    void loadDetail(id);
  }
}

async function loadDetail(id: string): Promise<void> {
  const sequence = ++detailSequence;
  detailId.value = id;
  detail.value = null;
  detailError.value = '';
  detailLoading.value = true;
  try {
    const loaded = await getSubmission(id);
    if (sequence === detailSequence) {
      detail.value = loaded;
    }
  } catch (error) {
    if (sequence === detailSequence) {
      detailError.value = error instanceof Error ? error.message : '详情加载失败';
    }
  } finally {
    if (sequence === detailSequence) {
      detailLoading.value = false;
    }
  }
}

function retryDetail(): void {
  if (detailId.value) {
    void loadDetail(detailId.value);
  }
}

function closeDetail(): void {
  clearDetailState();
  void router.replace({ path: '/admin' });
}

function clearDetailState(): void {
  detailSequence += 1;
  detailId.value = '';
  detail.value = null;
  detailError.value = '';
  detailLoading.value = false;
}

function openHandlingFromDetail(): void {
  const selected = detail.value;
  closeDetail();
  if (selected) {
    openHandling(selected);
  }
}

/**
 * 详情页"处理此反馈"深链：先在当前页找目标行，未命中（对象在第 2 页及以后）按 id 服务端定位。
 * 此前只在第一页 items 里 find，翻页后的对象会静默打不开处理面板。
 */
async function consumeHandlingDeepLink(): Promise<void> {
  const handlingId = typeof route.query.handling === 'string' ? route.query.handling : '';
  if (!handlingId) {
    return;
  }
  const detailQuery = typeof route.query.detail === 'string' ? route.query.detail : undefined;
  void router.replace({ path: '/admin', query: detailQuery ? { detail: detailQuery } : undefined });
  const row = page.items.find(item => item.id === handlingId);
  if (row) {
    openHandling(row);
    return;
  }
  try {
    openHandling(await getSubmission(handlingId));
  } catch (error) {
    deepLinkError.value = error instanceof Error ? error.message : '打开处理面板失败';
  }
}

// 请求序号护栏：连续查询/翻页时旧响应可能后到，只允许最新一次请求落盘
let loadSequence = 0;

async function load(pageNumber: number, clearRows = false): Promise<void> {
  const sequence = ++loadSequence;
  loading.value = true;
  loadError.value = '';
  handling.value = null;
  handlingMessage.value = '';
  if (clearRows) {
    page.items = [];
    page.total = 0;
    page.page = pageNumber;
  }
  try {
    const result = await listSubmissions({
      application: applied.application.trim() || undefined,
      status: applied.status || undefined,
      type: applied.type || undefined,
      kind: applied.kind || undefined,
      score: applied.score === '' ? undefined : applied.score,
      keyword: applied.keyword.trim() || undefined,
      page: pageNumber,
      size: page.size
    });
    if (sequence !== loadSequence) {
      return;
    }
    page.items = result.items.map(item => ({ ...item, submitter: '', actions: '' }));
    page.total = result.total;
    page.page = result.page;
  } catch (error) {
    if (sequence === loadSequence) {
      page.items = [];
      page.total = 0;
      page.page = pageNumber;
      loadError.value = error instanceof Error ? error.message : '列表加载失败';
    }
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
    }
  }
}

async function download(row: Pick<FeedbackSubmissionAdmin, 'id'>, attachment: FeedbackAttachmentMeta): Promise<void> {
  try {
    await downloadAdminAttachment(row.id, attachment.id, attachment.originalFilename);
  } catch (error) {
    alert(error instanceof Error ? error.message : '附件下载失败');
  }
}

function goPage(next: number): void {
  void load(next);
}

function changePageSize(size: number): void {
  page.size = size;
  void load(1, true);
}

// 筛选为显式查询（1.0.1 起）：下拉与关键词只改本地值不打请求，点「查询」快照生效并回第 1 页——
// 即选即查会让每次下拉变更都打服务端列表接口；未提交的改动不随翻页生效；输入框回车等同点查询
function search(): void {
  Object.assign(applied, filter);
  void load(1, true);
}

function resetFilters(): void {
  filter.application = '';
  filter.status = '';
  filter.type = '';
  filter.kind = '';
  filter.score = '';
  filter.keyword = '';
  Object.assign(applied, filter);
  void load(1, true);
}

function openHandling(row: FeedbackSubmissionAdmin): void {
  detailSequence += 1;
  detail.value = null;
  detailError.value = '';
  handling.value = row;
  handlingForm.targetStatus = row.status === 'submitted' ? 'resolved' : 'submitted';
  handlingForm.handlerNote = row.handlerNote ?? '';
  handlingForm.reply = row.reply ?? '';
  handlingMessage.value = '';
}

function closeHandling(): void {
  if (!handlingSubmitting.value) {
    handling.value = null;
    handlingMessage.value = '';
  }
}

async function submitHandling(): Promise<void> {
  if (!handling.value || handlingSubmitting.value) {
    return;
  }
  handlingSubmitting.value = true;
  try {
    const updated = await handleSubmission(handling.value.id, {
      targetStatus: handlingForm.targetStatus,
      handlerNote: handlingForm.handlerNote.trim() || null,
      reply: handlingForm.reply.trim() || null,
      expectedRowVersion: handling.value.rowVersion
    });
    handling.value = null;
    await load(page.page);
    void updated;
  } catch (error) {
    handlingMessage.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    handlingSubmitting.value = false;
  }
}
</script>
