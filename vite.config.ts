import http from 'node:http';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import qiankun from 'vite-plugin-qiankun';

export default defineConfig(({ command }) => {
  if (command === 'build' && !process.env.VITE_FEEDBACK_IAM_CLIENT_ID?.trim()) {
    throw new Error('VITE_FEEDBACK_IAM_CLIENT_ID must be injected for production build');
  }
  return {
    base: '/app/feedback/',
    plugins: [vue(), qiankun('feedback', { useDevMode: true })],
    server: {
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      proxy: {
        // 禁用 keep-alive：后端/nginx 重启后 proxy 不复用死连接（否则窗口期全 502）
        '/api': { target: 'http://localhost:8393', agent: new http.Agent({ keepAlive: false }) }
      }
    }
  };
});
