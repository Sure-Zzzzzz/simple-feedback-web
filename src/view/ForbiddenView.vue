<template>
  <main class="feedback-page" role="alert">
    <PageHeader title="无权访问" description="当前身份没有访问此页面的权限。" />
    <section class="feedback-panel feedback-forbidden">
      <h2>权限不足</h2>
      <p>页面权限随角色分配生效，请联系管理员分配对应权限后重新登录。</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import PageHeader from '@sure-zzzzzz/simple-iam-theme-contract/PageHeader';
</script>
