<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { api } from '../api';
import GroupGrid from '../components/GroupGrid.vue';

const {
  data: groups,
  isLoading,
  isError,
  refetch,
} = useQuery({
  queryKey: ['groups'],
  queryFn: async () => (await api.groups()).groups,
});
const { data: announcements } = useQuery({
  queryKey: ['announcements'],
  queryFn: async () => (await api.announcements()).announcements,
});
const visibleGroups = computed(() => (groups.value ?? []).filter((group) => group.isActive));
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Nhóm nhận</h1>
      <p>Danh sách nhóm được đồng bộ từ hệ thống nhân sự.</p>
    </div>
  </div>
  <GroupGrid
    :groups="visibleGroups"
    :announcements="announcements ?? []"
    :loading="isLoading"
    :error="isError"
    @retry="refetch()"
  />
</template>
