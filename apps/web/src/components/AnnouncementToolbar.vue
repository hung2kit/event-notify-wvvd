<script setup lang="ts">
import { IconSearch } from '@tabler/icons-vue';
import AppSelect from './AppSelect.vue';

const query = defineModel<string>('query', { required: true });
const status = defineModel<'all' | 'on' | 'off'>('status', { required: true });
const sort = defineModel<'next' | 'title'>('sort', { required: true });

const filters = [
  { id: 'all', label: 'Tất cả' },
  { id: 'on', label: 'Đang chạy' },
  { id: 'off', label: 'Tạm dừng' },
] as const;
</script>

<template>
  <div class="toolbar">
    <div class="search">
      <IconSearch :size="18" />
      <input v-model="query" class="input" type="search" placeholder="Tìm theo tiêu đề hoặc nhóm nhận" />
    </div>
    <div class="seg" role="group" aria-label="Lọc trạng thái">
      <button
        v-for="filter in filters"
        :key="filter.id"
        type="button"
        :class="{ act: status === filter.id }"
        @click="status = filter.id"
      >
        {{ filter.label }}
      </button>
    </div>
    <AppSelect
      v-model="sort"
      label="Sắp xếp"
      compact
      :options="[
        { value: 'next', label: 'Gần gửi nhất' },
        { value: 'title', label: 'Theo tên A–Z' },
      ]"
    />
  </div>
</template>
