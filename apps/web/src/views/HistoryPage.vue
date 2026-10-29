<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { api, ApiError } from '../api';
import HistoryTable from '../components/HistoryTable.vue';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import type { Delivery } from '../types';

const session = useSessionStore();
const toast = useToastStore();
const queryClient = useQueryClient();
const resending = ref<string | null>(null);

const {
  data: deliveries,
  isLoading,
  isError,
  refetch,
} = useQuery({
  queryKey: ['deliveries'],
  queryFn: async () => (await api.deliveries()).deliveries,
  refetchInterval: (query) =>
    query.state.data?.some((item) => item.status === 'queued' || item.status === 'sending')
      ? 3000
      : false,
});
const { data: me } = useQuery({
  queryKey: computed(() => ['me', session.devEmail]),
  queryFn: api.me,
});

function canRetry(item: Delivery): boolean {
  const user = me.value?.user;
  if (!user || item.status !== 'failed' || item.retried || item.announcementDeleted) return false;
  if (user.role === 'admin') return true;
  return user.role === 'editor' && item.announcementCreatedBy === user.id;
}

const { mutate: retry } = useMutation({
  mutationFn: (id: string) => api.retryDelivery(id),
  onMutate: (id) => {
    resending.value = id;
  },
  onSuccess: () => {
    toast.push('Đã đưa vào hàng gửi lại', 'send');
  },
  onError: (error) => {
    toast.push(error instanceof ApiError ? error.message : 'Không gửi lại được', 'alert');
  },
  onSettled: async () => {
    await queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
    resending.value = null;
  },
});
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Lịch sử gửi</h1>
      <p>Những email đã được hệ thống gửi đi gần đây.</p>
    </div>
  </div>
  <HistoryTable
    :items="deliveries ?? []"
    :loading="isLoading"
    :error="isError"
    :can-retry="canRetry"
    :resending="resending"
    @retry="refetch()"
    @resend="retry($event)"
  />
</template>
