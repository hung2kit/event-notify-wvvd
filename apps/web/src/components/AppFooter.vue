<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { api } from '../api';
import { useToastStore } from '../stores/toast';
import BrandLogo from './BrandLogo.vue';

const year = new Date().getFullYear();
const toast = useToastStore();
const { data: worker, isError } = useQuery({
  queryKey: ['worker-health'],
  queryFn: api.workerHealth,
  refetchInterval: 30_000,
});
const down = computed(() => isError.value || worker.value?.status === 'stale');

function soon() {
  toast.push('Trang này sẽ có sau.', 'info');
}
</script>

<template>
  <footer class="foot">
    <div class="foot-in">
      <div class="logo">
        <BrandLogo variant="pri" />
        <span class="divider"></span>
        <span class="prod">Event Notify</span>
      </div>
      <span>© {{ year }} Công cụ nội bộ, chỉ dành cho cán bộ nhân viên.</span>
      <span class="status-dot" :class="{ warn: down }">
        {{ down ? 'Hệ thống gửi mail chưa phản hồi' : 'Hệ thống gửi mail hoạt động bình thường' }}
      </span>
      <div class="foot-links">
        <a href="#" @click.prevent="soon">Hướng dẫn sử dụng</a>
        <a href="#" @click.prevent="soon">Chính sách bảo vệ dữ liệu</a>
        <a href="#" @click.prevent="soon">Bảo vệ trẻ em</a>
        <a href="#" @click.prevent="soon">Liên hệ IT</a>
        <span>v1.0</span>
      </div>
    </div>
  </footer>
</template>
