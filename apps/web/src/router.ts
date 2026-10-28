import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './lib/token';
import { resolveGuard } from './lib/scan';
import LoginPage from './pages/LoginPage.vue';
import ClassesPage from './pages/ClassesPage.vue';
import ScanPage from './pages/ScanPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginPage, meta: { public: true } },
    { path: '/', component: ClassesPage },
    { path: '/scan', component: ScanPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(to => resolveGuard(!!getToken(), { fullPath: to.fullPath, meta: { public: !!to.meta.public } }));
