<script setup lang="ts">
import {
  IconCalendarTime,
  IconChevronDown,
  IconHistory,
  IconLogout,
  IconMenu2,
  IconSettings,
  IconUser,
  IconUsersGroup,
} from '@tabler/icons-vue';
import { useQuery } from '@tanstack/vue-query';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui';
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '../api';
import { ROLE_LABEL } from '../lib/roles';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import BrandLogo from './BrandLogo.vue';

const navOpen = ref(false);
const session = useSessionStore();
const toast = useToastStore();
const router = useRouter();
const { data: me } = useQuery({
  queryKey: computed(() => ['me', session.devEmail]),
  queryFn: api.me,
});

const initial = computed(() => me.value?.user?.displayName.slice(0, 1) ?? 'H');
const name = computed(() => me.value?.user?.displayName ?? 'Hạnh');
const roleLine = computed(() => {
  const role = me.value?.user?.role;
  return role ? ROLE_LABEL[role] : '';
});

function closeNav() {
  navOpen.value = false;
}

function soon() {
  toast.push('Chức năng này sẽ có sau.', 'info');
}

function logout() {
  session.logout();
  void router.push('/login');
}
</script>

<template>
  <header class="top">
    <div class="top-in">
      <button class="burger" type="button" aria-label="Mở menu" @click="navOpen = !navOpen">
        <IconMenu2 :size="22" />
      </button>
      <div class="logo">
        <BrandLogo variant="rev" />
        <span class="divider"></span>
        <span class="prod">Event Notify</span>
      </div>
      <nav class="main" :class="{ open: navOpen }">
        <RouterLink to="/" custom v-slot="{ href, navigate, isExactActive }">
          <a
            :href="href"
            :class="{ act: isExactActive }"
            @click="
              navigate($event);
              closeNav();
            "
          >
            <IconCalendarTime :size="18" />Lịch gửi
          </a>
        </RouterLink>
        <RouterLink to="/history" custom v-slot="{ href, navigate, isActive }">
          <a
            :href="href"
            :class="{ act: isActive }"
            @click="
              navigate($event);
              closeNav();
            "
          >
            <IconHistory :size="18" />Lịch sử gửi
          </a>
        </RouterLink>
        <RouterLink to="/groups" custom v-slot="{ href, navigate, isActive }">
          <a
            :href="href"
            :class="{ act: isActive }"
            @click="
              navigate($event);
              closeNav();
            "
          >
            <IconUsersGroup :size="18" />Nhóm nhận
          </a>
        </RouterLink>
      </nav>
      <div class="user">
        <DropdownMenuRoot>
          <DropdownMenuTrigger class="user-btn" aria-label="Tài khoản">
            <span class="avatar">{{ initial }}</span>
            <span class="user-meta">
              <span>{{ name }}</span>
              <small>{{ roleLine }}</small>
            </span>
            <IconChevronDown :size="16" />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent class="user-menu" align="end" :side-offset="6">
              <DropdownMenuItem class="menu-item" @select="soon">
                <IconUser :size="18" />Hồ sơ của bạn
              </DropdownMenuItem>
              <DropdownMenuItem class="menu-item" @select="soon">
                <IconSettings :size="18" />Cài đặt người gửi
              </DropdownMenuItem>
              <DropdownMenuSeparator class="menu-sep" />
              <DropdownMenuItem class="menu-item" @select="logout">
                <IconLogout :size="18" />Đăng xuất
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </div>
  </header>
</template>
