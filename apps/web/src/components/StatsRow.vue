<script setup lang="ts">
import type { Stats } from '../types';
import { formatInstant } from '../lib/format';

const props = defineProps<{ stats: Stats | undefined; loading: boolean }>();

const nextText = () => {
  if (!props.stats?.next) return null;
  return formatInstant(props.stats.next.nextRunAt);
};
</script>

<template>
  <div class="stats">
    <div class="stat next">
      <span>Gửi kế tiếp</span>
      <b v-if="loading" class="sm skel-line"></b>
      <b v-else-if="stats?.next && nextText()" class="sm">
        {{ stats.next.title }}<br />
        <span class="next-sub">{{ nextText()?.relative }}, {{ nextText()?.time }}</span>
      </b>
      <b v-else class="sm">Chưa có lịch nào</b>
    </div>
    <div class="stat">
      <span>Đang chạy</span>
      <b v-if="loading" class="skel-line short"></b>
      <b v-else>{{ stats?.running ?? 0 }}</b>
    </div>
    <div class="stat">
      <span>Tạm dừng</span>
      <b v-if="loading" class="skel-line short"></b>
      <b v-else>{{ stats?.paused ?? 0 }}</b>
    </div>
    <div class="stat">
      <span>Đã gửi tháng này</span>
      <b v-if="loading" class="skel-line short"></b>
      <b v-else>{{ stats?.sentThisMonth ?? 0 }}</b>
    </div>
  </div>
</template>
