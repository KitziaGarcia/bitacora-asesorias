import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { setUnauthorizedHandler } from './api';
import { setToken } from './lib/token';
import './style.css';

setUnauthorizedHandler(() => {
  setToken(null);
  if (router.currentRoute.value.path === '/login') return;
  router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
});

createApp(App).use(router).mount('#app');
