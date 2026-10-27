<template>
  <main class="feedback-page">
    <PageHeader title="提交反馈" description="对产品模块的使用体验、问题与建议" />
    <section class="feedback-panel">
      <form class="feedback-form" @submit.prevent="submit">
        <label class="feedback-field">
          <span class="feedback-label">目标模块</span>
          <FormSelect v-model="form.applicationCode" :options="applicationOptions"
                      aria-label="目标模块" placeholder="请选择模块" />
        </label>

        <fieldset class="feedback-field">
          <span class="feedback-label">反馈类型</span>
          <div class="feedback-segment">
            <button
              v-for="item in TYPE_OPTIONS"
              :key="item.value"
              type="button"
              class="feedback-segment-item"
              :class="{ 'is-active': form.type === item.value }"
              @click="form.type = item.value"
            >
              {{ item.label }}
            </button>
          </div>
        </fieldset>

        <fieldset class="feedback-field">
          <span class="feedback-label">满意度打分（{{ form.score }} / 10）</span>
          <div class="feedback-score">
            <button
              v-for="n in 10"
              :key="n"
              type="button"
              class="feedback-score-item"
              :class="{ 'is-active': form.score >= n, 'is-current': form.score === n }"
              :aria-label="`打 ${n} 分`"
              :aria-pressed="form.score === n"
              @click="form.score = n"
            >
              {{ n }}
            </button>
          </div>
        </fieldset>

        <label class="feedback-field">
          <span class="feedback-label">反馈内容</span>
          <textarea
            v-model="form.content"
            class="feedback-input"
            rows="5"
            maxlength="2000"
            placeholder="请描述问题现象、复现步骤或建议（不超过 2000 字）"
            required
          />
        </label>

        <label class="feedback-field">
          <span class="feedback-label">联系邮箱（选填）</span>
          <input
            v-model="form.contactEmail"
            type="email"
            class="feedback-input"
            maxlength="254"
            placeholder="便于我们回复你（可修改，不填则不留联系方式）"
          />
        </label>

        <div class="feedback-field">
          <span class="feedback-label">截图（选填，最多 3 张，每张 5MB 内，jpg/png/webp）</span>
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            @change="onFilesChange"
          />
          <p v-if="attachmentError" class="feedback-message is-error" role="alert">{{ attachmentError }}</p>
          <ul v-if="form.files.length" class="feedback-files">
            <li v-for="(file, index) in form.files" :key="file.name + index">
              {{ file.name }}（{{ Math.round(file.size / 1024) }}KB）
              <button type="button" class="feedback-link" @click="removeFile(index)">移除</button>
            </li>
          </ul>
        </div>

        <p v-if="applicationsError" class="feedback-message is-error">
          {{ applicationsError }}
          <button type="button" class="feedback-link" @click="loadApplications">重试</button>
        </p>
        <p v-else-if="hintDegraded" class="feedback-muted">提示信息加载失败：已展示全部启用模块、联系邮箱未预填（不影响提交）。</p>
        <p v-if="prefillNotice" class="feedback-muted">{{ prefillNotice }}</p>

        <p v-if="message" class="feedback-message" :class="isError ? 'is-error' : 'is-ok'">{{ message }}</p>

        <div class="feedback-actions">
          <button type="submit" class="button-primary feedback-primary" :disabled="submitting">
            {{ submitting ? '提交中…' : '提交反馈' }}
          </button>
        </div>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '@sure-zzzzzz/simple-iam-theme-contract/PageHeader';
import FormSelect, { type FormSelectOption } from '@sure-zzzzzz/simple-iam-theme-contract/FormSelect';
import {
  createSubmission,
  fetchSelectableApplications,
  fetchSubmissionHint,
  type SubmissionHint
} from '../api/feedbackApi';
import { feedbackIdempotencyKey } from '../auth/pkce';
import { validateAttachmentFiles } from '../attachmentPolicy';
import { themeState } from '../themeState';

/** 下拉条目最小形态（hint 详情与注册表回退两来源共用）。 */
interface SelectableModule {
  applicationCode: string;
  displayName: string | null;
}

const TYPE_OPTIONS = [
  { value: 'bug', label: '缺陷报告' },
  { value: 'feature', label: '功能建议' },
  { value: 'experience', label: '体验问题' },
  { value: 'other', label: '其他' }
] as const;

const route = useRoute();
const applications = ref<SelectableModule[]>([]);
const applicationOptions = computed<FormSelectOption[]>(() => applications.value.map(item => ({
  value: item.applicationCode,
  label: item.displayName ? `${item.displayName}（${item.applicationCode}）` : item.applicationCode
})));
const applicationsError = ref('');
const hintDegraded = ref(false);
const prefillNotice = ref('');
const submitting = ref(false);
const message = ref('');
const isError = ref(false);
const attachmentError = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
// 表单会话级幂等键与环境快照成对轮换：同键重试期间环境快照冻结（摘要稳定）。
// 只有提交成功后才轮换；所有失败都复用同键，由服务端区分重放、同键异摘要和新提交。
const idempotencyKey = ref(feedbackIdempotencyKey());
const environmentSnapshot = ref<Record<string, string> | null>(null);

const form = reactive({
  applicationCode: '',
  kind: 'proactive' as 'proactive' | 'intercepted',
  type: 'bug' as 'bug' | 'feature' | 'experience' | 'other',
  score: 10,
  content: '',
  contactEmail: '',
  contextPath: '',
  files: [] as File[]
});

onMounted(async () => {
  // 深链预填（用户可改可清）
  const query = route.query;
  if (typeof query.applicationCode === 'string') {
    form.applicationCode = query.applicationCode;
  }
  if (query.kind === 'intercepted') {
    form.kind = 'intercepted';
  }
  if (typeof query.contextPath === 'string') {
    form.contextPath = query.contextPath;
  }
  await loadApplications();
});

/**
 * 模块清单优先走 hint 单口子（服务端已做交集/回退，名称与门户侧边栏同源）；
 * hint 取数失败才回退注册表全量（与服务端降级同构，名称取注册表展示名），
 * 两级都失败才如实阻塞提交（此前 hint 失败会连坐拖垮模块列表）。
 */
async function loadApplications(): Promise<void> {
  applicationsError.value = '';
  hintDegraded.value = false;
  prefillNotice.value = '';
  let hint: SubmissionHint | null = null;
  try {
    hint = await fetchSubmissionHint();
  } catch {
    hint = null;
  }
  if (hint) {
    applications.value = hint.applications;
  } else {
    hintDegraded.value = true;
    try {
      applications.value = await fetchSelectableApplications();
    } catch (error) {
      applicationsError.value = error instanceof Error ? error.message : '模块列表加载失败';
      return;
    }
  }
  if (!form.applicationCode && applications.value.length === 1) {
    form.applicationCode = applications.value[0].applicationCode;
  }
  if (form.applicationCode && !applications.value.some(item => item.applicationCode === form.applicationCode)) {
    prefillNotice.value = `指定模块 ${form.applicationCode} 不在你当前可选列表，请重新选择`;
    form.applicationCode = '';
  }
  if (hint?.contactEmail && !form.contactEmail) {
    form.contactEmail = hint.contactEmail;
  }
}

/** 环境快照采集（键白名单 ua/viewport/theme/locale，服务端裁剪后落库）。 */
function collectEnvironment(): Record<string, string> {
  return {
    ua: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    theme: themeState.currentName,
    locale: navigator.language
  };
}

function onFilesChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : [];
  const validationError = validateAttachmentFiles(files);
  if (validationError) {
    form.files = [];
    input.value = '';
    attachmentError.value = validationError;
    return;
  }
  form.files = files;
  attachmentError.value = '';
}

function removeFile(index: number): void {
  form.files.splice(index, 1);
  attachmentError.value = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

async function submit(): Promise<void> {
  if (submitting.value) {
    return;
  }
  if (!form.applicationCode) {
    message.value = '请选择目标模块';
    isError.value = true;
    return;
  }
  submitting.value = true;
  message.value = '';
  // 环境快照与幂等键同生命周期：同键重试不重采，摘要稳定（服务端同键异参会拒）
  if (!environmentSnapshot.value) {
    environmentSnapshot.value = collectEnvironment();
  }
  try {
    const created = await createSubmission({
      applicationCode: form.applicationCode,
      kind: form.kind,
      type: form.type,
      score: form.score,
      content: form.content,
      contactEmail: form.contactEmail.trim() || null,
      contextPath: form.contextPath.trim() || null,
      environment: environmentSnapshot.value,
      files: form.files
    }, idempotencyKey.value);
    message.value = '提交成功，感谢反馈！可在「我的反馈」查看处理回复。';
    isError.value = false;
    rotateIdempotencyKey();
    form.content = '';
    form.files = [];
    if (fileInput.value) {
      fileInput.value.value = '';
    }
    void created;
  } catch (error) {
    message.value = error instanceof Error ? error.message : '提交失败，请稍后再试';
    isError.value = true;
  } finally {
    submitting.value = false;
  }
}

function rotateIdempotencyKey(): void {
  idempotencyKey.value = feedbackIdempotencyKey();
  environmentSnapshot.value = null;
}
</script>
