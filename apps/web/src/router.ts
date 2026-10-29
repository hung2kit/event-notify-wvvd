import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from './stores/session';
import GroupsPage from './views/GroupsPage.vue';
import HistoryPage from './views/HistoryPage.vue';
import LoginPage from './views/LoginPage.vue';
import SchedulePage from './views/SchedulePage.vue';
import Shell from './views/Shell.vue';

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/login', component: LoginPage },
    {
      path: '/',
      component: Shell,
      children: [
        { path: '', component: SchedulePage },
        { path: 'history', component: HistoryPage },
        { path: 'groups', component: GroupsPage },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!session.loggedIn && to.path !== '/login') return '/login';
  if (session.loggedIn && to.path === '/login') return '/';
  return true;
});
