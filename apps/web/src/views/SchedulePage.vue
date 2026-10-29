<script setup lang="ts">
import { IconPlus } from '@tabler/icons-vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { ApiError, api } from '../api';
import AnnouncementDrawer from '../components/AnnouncementDrawer.vue';
import AnnouncementList from '../components/AnnouncementList.vue';
import AnnouncementToolbar from '../components/AnnouncementToolbar.vue';
import StatsRow from '../components/StatsRow.vue';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import type { Announcement } from '../types';

const query = ref('');
const status = ref<'all' | 'on' | 'off'>('all');
const sort = ref<'next' | 'title'>('next');
const drawerOpen = ref(false);
const editing = ref<Announcement | null>(null);
const toast = useToastStore();
const session = useSessionStore();
const queryClient = useQueryClient();

const {
  data: announcements,
  isLoading: listLoading,
  isError: listError,
  refetch: refetchList,
} = useQuery({
  queryKey: ['announcements'],
  queryFn: async () => (await api.announcements()).announcements,
});
const { data: stats, isLoading: statsLoading } = useQuery({
  queryKey: ['stats'],
  queryFn: api.stats,
});
const { data: groups } = useQuery({
  queryKey: ['groups'],
  queryFn: async () => (await api.groups()).groups,
});
const { data: me } = useQuery({
  queryKey: computed(() => ['me', session.devEmail]),
  queryFn: api.me,
});
const canWrite = computed(() => {
  const role = me.value?.user?.role;
  return role === 'admin' || role === 'editor';
});

function canEditItem(item: Announcement | null): boolean {
  const user = me.value?.user;
  if (!user || user.role === 'viewer') return false;
  if (!item) return user.role === 'admin' || user.role === 'editor';
  if (user.role === 'admin') return true;
  return user.role === 'editor' && item.createdBy === user.id;
}
const activeGroups = computed(() => (groups.value ?? []).filter((group) => group.isActive));

const visible = computed(() => {
  const term = query.value.trim().toLowerCase();
  const rows = (announcements.value ?? []).filter((item) => {
    if (status.value === 'on' && !item.isActive) return false;
    if (status.value === 'off' && item.isActive) return false;
    if (!term) return true;
    return (
      item.title.toLowerCase().includes(term) ||
      item.groups.some((group) => group.name.toLowerCase().includes(term))
    );
  });
  if (sort.value === 'title')
    return [...rows].sort((left, right) => left.title.localeCompare(right.title, 'vi'));
  return [...rows].sort(
    (left, right) => Number(right.isActive) - Number(left.isActive) || compareNext(left, right),
  );
});

function compareNext(left: Announcement, right: Announcement): number {
  if (!left.nextRunAt && !right.nextRunAt) return 0;
  if (!left.nextRunAt) return 1;
  if (!right.nextRunAt) return -1;
  return left.nextRunAt.localeCompare(right.nextRunAt);
}

const { mutate: toggle } = useMutation({
  mutationFn: (vars: { item: Announcement; isActive: boolean }) =>
    api.setActive(vars.item.id, vars.isActive),
  onMutate: async (vars) => {
    await queryClient.cancelQueries({ queryKey: ['announcements'] });
    const previous = queryClient.getQueryData<Announcement[]>(['announcements']);
    queryClient.setQueryData<Announcement[]>(['announcements'], (current) =>
      current?.map((item) =>
        item.id === vars.item.id ? { ...item, isActive: vars.isActive } : item,
      ),
    );
    return { previous };
  },
  onError: (error, _vars, context) => {
    if (context?.previous) queryClient.setQueryData(['announcements'], context.previous);
    toast.push(
      error instanceof ApiError ? error.message : 'Không đổi được trạng thái. Thử lại.',
      'alert',
    );
  },
  onSuccess: (result, vars) => {
    queryClient.setQueryData<Announcement[]>(['announcements'], (current) =>
      current?.map((item) =>
        item.id === vars.item.id
          ? {
              ...item,
              isActive: result.isActive,
              nextRunAt: result.nextRunAt,
              version: result.version,
            }
          : item,
      ),
    );
    toast.push(
      vars.isActive ? `Đã bật: ${vars.item.title}` : `Đã tạm dừng: ${vars.item.title}`,
      vars.isActive ? 'play' : 'pause',
    );
  },
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: ['announcements'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  },
});

function create() {
  editing.value = null;
  drawerOpen.value = true;
}

function edit(item: Announcement) {
  editing.value = item;
  drawerOpen.value = true;
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Lịch gửi thông báo</h1>
      <p>Các email tự động gửi tới cán bộ, nhân viên theo lịch bạn đặt.</p>
    </div>
    <button v-if="canWrite" class="btn primary" type="button" @click="create">
      <IconPlus :size="18" />Tạo thông báo
    </button>
  </div>
  <StatsRow :stats="stats" :loading="statsLoading" />
  <AnnouncementToolbar v-model:query="query" v-model:status="status" v-model:sort="sort" />
  <AnnouncementList
    :items="visible"
    :loading="listLoading"
    :error="listError"
    :can-toggle="canWrite"
    :can-create="canWrite"
    :can-edit="canEditItem"
    @toggle="(item, value) => toggle({ item, isActive: value })"
    @edit="edit"
    @create="create"
    @retry="refetchList()"
  />
  <AnnouncementDrawer
    v-model:open="drawerOpen"
    :announcement="editing"
    :groups="activeGroups"
    :can-edit="canEditItem(editing)"
    :can-test="canWrite"
  />
</template>
