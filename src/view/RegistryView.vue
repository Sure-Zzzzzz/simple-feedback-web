<template>
  <main class="feedback-page">
    <PageHeader title="应用注册表" description="登记可接收反馈的模块（编码与门户可信应用一致）" />
    <section class="feedback-panel">
      <div class="feedback-actions">
        <button type="button" class="button-primary feedback-primary" :disabled="saving || resyncing" @click="openCreate">登记模块</button>
      </div>

      <p v-if="loadError" class="feedback-message is-error">
        {{ loadError }}
        <button type="button" class="feedback-link" @click="load">重试</button>
      </p>
      <DataTable v-else class="feedback-sticky-actions" :columns="columns" :rows="items" row-key="applicationCode"
                 scroll-min-width="1110px" :loading="loading" empty-text="尚无登记模块。">
        <template #cell-source="{ row }">
          <span v-if="row.source === 'IAM'" class="status-badge success feedback-status-badge" title="展示名由 IAM 单一事实源承担，本表锁定">
            IAM 同源
          </span>
          <span v-else-if="row.source === 'MANUAL'" class="status-badge neutral feedback-status-badge" title="编码未命中 IAM 目录，本表自主登记">本表登记</span>
          <span v-else class="status-badge warning feedback-status-badge" title="IAM 目录不可核对（散形态或出站失败），全字段可编辑">未核对</span>
        </template>
        <template #cell-enabled="{ row }">
          <span class="status-badge feedback-status-badge" :class="row.enabled ? 'success' : 'neutral'">
            {{ row.enabled ? '启用' : '停用' }}
          </span>
        </template>
        <template #cell-actions="{ row }">
          <button type="button" class="table-action" :disabled="loading || saving || resyncing" @click="openEdit(row)">编辑</button>
        </template>
      </DataTable>
      <p v-if="loading && items.length" class="feedback-hint" role="status">正在更新列表…</p>

      <Drawer
        :open="editing !== null"
        :title="mode === 'edit' ? '编辑模块' : '登记模块'"
        description="应用编码与门户可信应用保持一致；同源展示名由 IAM 目录负责。"
        :pending="saving || resyncing"
        @close="closeEditor"
      >
        <form v-if="editing" class="drawer-form" @submit.prevent="save">
          <label class="feedback-field">
            <span class="feedback-label">应用编码（创建后不可变）</span>
            <input v-model="editing.applicationCode" class="feedback-input" maxlength="64"
                   :disabled="saving || resyncing || mode === 'edit'" placeholder="如 vuln-scanner" />
            <span v-if="mode === 'create'" class="feedback-hint">
              编码与门户可信应用一致时，展示名将自动取 IAM 官方名（无需手抄）
            </span>
          </label>
          <label class="feedback-field">
            <span class="feedback-label">展示名</span>
            <input v-model="editing.displayName" class="feedback-input" maxlength="64" placeholder="如 漏洞扫描"
                   :disabled="saving || resyncing || (mode === 'edit' && editSource === 'IAM')" />
            <span v-if="mode === 'edit' && editSource === 'IAM'" class="feedback-hint">
              IAM 同源行的展示名以 IAM 为准，此处不可编辑
            </span>
          </label>
          <label class="feedback-field">
            <span class="feedback-label">说明（选填）</span>
            <input v-model="editing.description" class="feedback-input" maxlength="200"
                   :disabled="saving || resyncing" />
          </label>
          <label class="feedback-field">
            <span class="feedback-label">期望处理组（备注，不做权限计算）</span>
            <input v-model="editing.ownerGroup" class="feedback-input" maxlength="64"
                   :disabled="saving || resyncing" />
          </label>
          <fieldset class="feedback-field">
            <legend class="feedback-label">受理状态</legend>
            <label class="feedback-checkbox-field">
              <input v-model="editing.enabled" type="checkbox" :disabled="saving || resyncing" />
              <span>启用受理</span>
            </label>
            <span class="feedback-hint">停用后不再受理新反馈，历史反馈不受影响。</span>
          </fieldset>
          <p v-if="formMessage" class="feedback-message is-error" role="alert">{{ formMessage }}</p>
          <div class="drawer-actions">
            <button type="button" class="button-secondary" :disabled="saving || resyncing" @click="closeEditor">取消</button>
            <button v-if="mode === 'edit' && editSource === 'IAM'" type="button"
                    class="button-secondary" :disabled="saving || resyncing" @click="resyncFromIam">
              {{ resyncing ? '同步中…' : '从 IAM 重新同步展示名' }}
            </button>
            <button type="submit" class="button-primary feedback-primary" :disabled="saving || resyncing">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </form>
      </Drawer>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import PageHeader from '@sure-zzzzzz/simple-iam-theme-contract/PageHeader';
import DataTable, { type DataTableColumn } from '@sure-zzzzzz/simple-iam-theme-contract/DataTable';
import Drawer from '@sure-zzzzzz/simple-iam-theme-contract/Drawer';
import {
  createApplication,
  listApplications,
  updateApplication,
  type ApplicationUpsertInput,
  type FeedbackApplicationInfo
} from '../api/feedbackApi';

interface RegistryRow extends FeedbackApplicationInfo {
  actions: string;
}

const columns: DataTableColumn[] = [
  { key: 'applicationCode', label: '编码', width: '155px' },
  { key: 'displayName', label: '展示名', width: '190px' },
  { key: 'source', label: '数据来源', width: '105px', nowrap: true },
  { key: 'description', label: '说明', width: '340px' },
  { key: 'ownerGroup', label: '处理组', width: '140px' },
  { key: 'enabled', label: '状态', width: '90px', nowrap: true },
  { key: 'actions', label: '操作', width: '90px', nowrap: true }
];

const items = ref<RegistryRow[]>([]);
const loading = ref(true);
const loadError = ref('');
const editing = ref<ApplicationUpsertInput | null>(null);
const mode = ref<'create' | 'edit'>('create');
const editCode = ref('');
const editVersion = ref(0);
const editSource = ref<'IAM' | 'MANUAL' | 'UNKNOWN' | null>(null);
const formMessage = ref('');
const saving = ref(false);
const resyncing = ref(false);

onMounted(() => load());

// 请求序号护栏：保存后重载与手动重试并发时，只允许最新一次请求落盘
let loadSequence = 0;

async function load(): Promise<void> {
  const sequence = ++loadSequence;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await listApplications();
    if (sequence !== loadSequence) {
      return;
    }
    items.value = result.map(item => ({ ...item, actions: '' }));
  } catch (error) {
    if (sequence === loadSequence) {
      items.value = [];
      // 此前无 catch：失败表现为空列表，被误读成"尚无登记模块"
      loadError.value = error instanceof Error ? error.message : '注册表加载失败';
    }
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
    }
  }
}

function openCreate(): void {
  mode.value = 'create';
  editCode.value = '';
  editVersion.value = 0;
  editSource.value = null;
  editing.value = {
    applicationCode: '',
    displayName: '',
    description: '',
    enabled: true,
    ownerGroup: ''
  };
  formMessage.value = '';
}

function openEdit(row: RegistryRow): void {
  mode.value = 'edit';
  editCode.value = row.applicationCode;
  editVersion.value = row.rowVersion;
  editSource.value = row.source ?? null;
  editing.value = {
    applicationCode: row.applicationCode,
    displayName: row.displayName,
    description: row.description ?? '',
    enabled: row.enabled,
    ownerGroup: row.ownerGroup ?? '',
    expectedRowVersion: row.rowVersion
  };
  formMessage.value = '';
}

function closeEditor(): void {
  if (!saving.value && !resyncing.value) {
    editing.value = null;
    formMessage.value = '';
  }
}

// 同源行显式重同步：服务端抄录 IAM 官方名（IAM 侧改名后本表陈旧的修复入口）
async function resyncFromIam(): Promise<void> {
  if (saving.value || resyncing.value) {
    return;
  }
  resyncing.value = true;
  try {
    const updated = await updateApplication(editCode.value, {
      displayName: editing.value?.displayName ?? '',
      description: editing.value?.description?.trim() || null,
      enabled: editing.value?.enabled ?? true,
      ownerGroup: editing.value?.ownerGroup?.trim() || null,
      expectedRowVersion: editVersion.value,
      syncFromIam: true
    });
    if (editing.value) {
      editing.value.displayName = updated.displayName;
    }
    editVersion.value = updated.rowVersion;
    if (editing.value) {
      editing.value.expectedRowVersion = updated.rowVersion;
    }
    await load();
    formMessage.value = '';
  } catch (error) {
    formMessage.value = error instanceof Error ? error.message : '同步失败';
  } finally {
    resyncing.value = false;
  }
}

async function save(): Promise<void> {
  const input = editing.value;
  if (!input || saving.value) {
    return;
  }
  if (!input.applicationCode?.trim() || !input.displayName.trim()) {
    formMessage.value = '应用编码与展示名必填';
    return;
  }
  saving.value = true;
  try {
    if (mode.value === 'create') {
      await createApplication({
        applicationCode: input.applicationCode.trim(),
        displayName: input.displayName.trim(),
        description: input.description?.trim() || null,
        enabled: input.enabled,
        ownerGroup: input.ownerGroup?.trim() || null
      });
    } else {
      await updateApplication(editCode.value, {
        displayName: input.displayName.trim(),
        description: input.description?.trim() || null,
        enabled: input.enabled,
        ownerGroup: input.ownerGroup?.trim() || null,
        expectedRowVersion: editVersion.value
      });
    }
    editing.value = null;
    await load();
  } catch (error) {
    formMessage.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    saving.value = false;
  }
}
</script>
