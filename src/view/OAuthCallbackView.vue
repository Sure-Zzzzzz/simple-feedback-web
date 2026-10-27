<template>
  <main class="feedback-page">
    <PageHeader title="登录回调" description="完成授权后自动跳转" />
    <section class="feedback-panel">
      <p v-if="pending">正在完成授权…</p>
      <p v-else-if="error" class="feedback-message is-error">{{ error }}</p>
      <p v-else>授权完成，正在返回…</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@sure-zzzzzz/simple-iam-theme-contract/PageHeader';
import { handleFeedbackCallback } from '../auth/pkce';

const route = useRoute();
const router = useRouter();
const pending = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    const outcome = await handleFeedbackCallback(window.location.search);
    if (outcome.kind === 'authorized') {
      await router.replace(outcome.target || '/submit');
    } else if (outcome.kind === 'state-mismatch') {
      error.value = '授权状态校验失败，请重新进入';
      pending.value = false;
    } else {
      error.value = '回调参数缺失，请从门户重新进入';
      pending.value = false;
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '令牌交换失败';
    pending.value = false;
  }
  void route;
});
</script>
