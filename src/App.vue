<template>
  <div class="feedback-app" :class="{ 'feedback-app--standalone': standalone }">
    <!-- 门户 qiankun 形态：应用菜单由门户侧栏承载，子应用只渲染内容区，不自带导航；
         直开（standalone）形态仅显示标题栏与返回门户出路（CRM 管理台同构） -->
    <header v-if="standalone" class="feedback-standalone-header">
      <h1>产品反馈</h1>
      <button type="button" class="button-secondary" @click="backToPortal">返回门户</button>
    </header>
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper';

const standalone = !qiankunWindow.__POWERED_BY_QIANKUN__;

function backToPortal(): void {
  window.location.assign('/app/');
}
</script>
