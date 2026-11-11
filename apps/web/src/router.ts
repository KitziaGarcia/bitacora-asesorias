import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './lib/token';
import { resolveGuard } from './lib/scan';
import LoginPage from './pages/LoginPage.vue';
import ClassesPage from './pages/ClassesPage.vue';
import ScanPage from './pages/ScanPage.vue';
import WelcomePage from './pages/WelcomePage.vue';
import TeacherPage from './pages/TeacherPage.vue';
import StaffLoginPage from './pages/StaffLoginPage.vue';
import AdminPage from './pages/AdminPage.vue';
import AdminPlaceholder from './pages/AdminPlaceholder.vue';
import { getStaffSession } from './lib/staff-session';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/inicio', component: WelcomePage, meta: { public: true } },
    { path: '/profesores/login', component: StaffLoginPage, props: { role: 'teacher' }, meta: { public: true } },
    { path: '/admin/login', component: StaffLoginPage, props: { role: 'admin' }, meta: { public: true } },
    { path: '/profesores', component: TeacherPage, props: { role: 'teacher' }, meta: { staffRole: 'teacher' } },
    {
      path: '/admin', component: AdminPage, meta: { staffRole: 'admin' },
      children: [
        { path: '', component: TeacherPage, props: { role: 'admin' } },
        { path: 'materias', component: AdminPlaceholder },
        { path: 'maestros', component: AdminPlaceholder },
      ],
    },
    { path: '/login', component: LoginPage, meta: { public: true } },
    { path: '/', component: ClassesPage },
    { path: '/scan', component: ScanPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(to => {
  const role = to.meta.staffRole;
  if (role === 'teacher' || role === 'admin') {
    if (getStaffSession(role)) return true;
    return role === 'admin' ? '/admin/login' : '/profesores/login';
  }
  if (!getToken() && to.path === '/') return '/inicio';
  return resolveGuard(!!getToken(), { fullPath: to.fullPath, meta: { public: !!to.meta.public } });
});
