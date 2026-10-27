<template>
  <main class="feedback-page">
    <PageHeader title="我的反馈" description="你提交过的反馈与处理回复" />
    <section class="feedback-panel">
      <div class="feedback-filter">
        <input v-model="keyword" class="feedback-input" maxlength="64"
               placeholder="搜索反馈内容" @keyup.enter="search" />
        <div class="feedback-filter-actions">
          <button type="button" class="button-primary feedback-primary" @click="search">查询</button>
          <button type="button" class="button-secondary" @click="resetFilters">重置</button>
        </div>
      </div>

      <p v-if="loadError" class="feedback-message is-error">
        {{ loadError }}
        <button type="button" class="feedback-link" @click="load(page.page)">重试</button>
      </p>
      <DataTable v-else :columns="columns" :rows="page.items" row-key="id"
                 scroll-min-width="1140px" :loading="loading"
                 :empty-text="appliedKeyword ? '未搜到匹配的反馈。' : '还没有提交过反馈。'">
        <template #cell-actions="{ row }">
          <button type="button" class="table-action" :disabled="loading" @click="openDetail(row)">详情</button>
        </template>
        <template #cell-status="{ row }">
          <span class="status-badge feedback-status-badge" :class="statusBadgeTone(row.status)">
            {{ statusText(row.status) }}
          </span>
        </template>
        <template #cell-applicationCode="{ row }">{{ applicationText(appNames, row.applicationCode) }}</template>
        <template #cell-type="{ row }">{{ typeText(row.type) }}</template>
        <template #cell-content="{ row }">
          <span class="feedback-content-preview">{{ row.content }}</span>
          <span v-if="row.reply" class="feedback-reply-preview">已回复：{{ row.reply }}</span>
        </template>
        <template #cell-attachments="{ row }">
          <div v-if="row.attachments.length" class="feedback-attachment-list">
            <button
              v-for="attachment in row.attachments"
              :key="attachment.id"
              type="button"
              class="table-action feedback-attachment-action"
              :title="attachment.originalFilename"
              :disabled="loading"
              @click="download(row, attachment)"
            >
              {{ attachment.originalFilename }}
            </button>
          </div>
          <template v-else>—</template>
        </template>
        <template #cell-createdTime="{ row }">{{ formatTime(row.createdTime) }}</template>
      </DataTable>
      <p v-if="loading && page.items.length" class="feedback-hint" role="status">正在更新列表…</p>

      <Pagination
        v-if="page.total > 0"
        :current="page.page"
        :page-size="page.size"
        :total="page.total"
        @update:current="goPage"
        @update:page-size="changePageSize"
      />

      <Drawer
        :open="detail !== null"
        title="反馈详情"
        :description="detail ? `${applicationText(appNames, detail.applicationCode)} · ${statusText(detail.status)}` : undefined"
        @close="detail = null"
      >
        <div v-if="detail" class="feedback-drawer-stack">
          <div class="feedback-detail-meta">
            <span class="status-badge feedback-status-badge" :class="statusBadgeTone(detail.status)">
              {{ statusText(detail.status) }}
            </span>
            <span>{{ typeText(detail.type) }} · {{ detail.score }} 分</span>
            <span>{{ formatTime(detail.createdTime) }}</span>
          </div>
          <div class="feedback-detail-section">
            <strong>反馈内容</strong>
            <p class="feedback-content">{{ detail.content }}</p>
          </div>
          <div v-if="detail.reply" class="feedback-detail-section">
            <strong>处理回复 <span class="feedback-muted">{{ formatTime(detail.repliedAt) }}</span></strong>
            <p class="feedback-content">{{ detail.reply }}</p>
          </div>
          <div v-if="detail.attachments.length" class="feedback-detail-section">
            <strong>附件</strong>
            <div class="feedback-attachment-list">
              <button v-for="attachment in detail.attachments" :key="attachment.id" type="button"
                      class="table-action" @click="download(detail, attachment)">
                {{ attachment.originalFilename }}
              </button>
            </div>
          </div>
          <div class="drawer-actions">
            <button type="button" class="button-secondary" @click="detail = null">关闭</button>
          </div>
        </div>
      </Drawer>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import PageHeader from '@sure-zzzzzz/simple-iam-theme-contract/PageHeader';
import DataTable, { type DataTableColumn } from '@sure-zzzzzz/simple-iam-theme-contract/DataTable';
import Pagination from '@sure-zzzzzz/simple-iam-theme-contract/Pagination';
import Drawer from '@sure-zzzzzz/simple-iam-theme-contract/Drawer';
import {
  downloadMyAttachment,
  listMySubmissions,
  type FeedbackAttachmentMeta,
  type FeedbackPage,
  type FeedbackSubmissionSummary
} from '../api/feedbackApi';
import { applicationText, formatTime, statusBadgeTone, statusText, typeText, useApplicationNames } from '../display';

const columns: DataTableColumn[] = [
  { key: 'actions', label: '操作', width: '90px', nowrap: true },
  { key: 'status', label: '状态', width: '100px', nowrap: true },
  { key: 'applicationCode', label: '模块', width: '150px' },
  { key: 'type', label: '类型', width: '105px', nowrap: true },
  { key: 'score', label: '打分', width: '60px', nowrap: true },
  { key: 'content', label: '内容', width: '330px' },
  { key: 'attachments', label: '附件', width: '140px' },
  { key: 'createdTime', label: '提交时间', width: '160px', nowrap: true }
];

const page = reactive<FeedbackPage<FeedbackSubmissionSummary>>({
  items: [],
  total: 0,
  page: 1,
  size: 20
});
const loading = ref(true);
const loadError = ref('');
const appNames = useApplicationNames();
const detail = ref<FeedbackSubmissionSummary | null>(null);
// 内容关键词为显式查询（与管理页同构）：输入只改本地值，点「查询」快照生效并回第 1 页，
// 未提交的输入不随翻页生效
const keyword = ref('');
const appliedKeyword = ref('');

onMounted(() => load(1));

// 请求序号护栏：快速翻页时旧响应可能后到，只允许最新一次请求落盘
let loadSequence = 0;

async function load(pageNumber: number, clearRows = false): Promise<void> {
  const sequence = ++loadSequence;
  loading.value = true;
  loadError.value = '';
  detail.value = null;
  if (clearRows) {
    page.items = [];
    page.total = 0;
    page.page = pageNumber;
  }
  try {
    const result = await listMySubmissions(pageNumber, page.size, appliedKeyword.value.trim() || undefined);
    if (sequence !== loadSequence) {
      return;
    }
    page.items = result.items;
    page.total = result.total;
    page.page = result.page;
    page.size = result.size;
  } catch (error) {
    if (sequence === loadSequence) {
      page.items = [];
      page.total = 0;
      page.page = pageNumber;
      // 此前无 catch：失败表现为空列表，被误读成"还没有提交过反馈"
      loadError.value = error instanceof Error ? error.message : '列表加载失败';
    }
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
    }
  }
}

function search(): void {
  appliedKeyword.value = keyword.value;
  void load(1, true);
}

function resetFilters(): void {
  keyword.value = '';
  appliedKeyword.value = '';
  void load(1, true);
}

function goPage(next: number): void {
  void load(next);
}

function changePageSize(size: number): void {
  page.size = size;
  void load(1, true);
}

function openDetail(row: FeedbackSubmissionSummary): void {
  detail.value = row;
}

async function download(row: FeedbackSubmissionSummary, attachment: FeedbackAttachmentMeta): Promise<void> {
  try {
    await downloadMyAttachment(row.id, attachment.id, attachment.originalFilename);
  } catch (error) {
    alert(error instanceof Error ? error.message : '附件下载失败');
  }
}
</script>
