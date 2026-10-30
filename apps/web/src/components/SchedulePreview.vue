<script setup lang="ts">
import type { Frequency } from '@event-notify/shared/schema';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { formatLocal } from '../lib/format';

const props = defineProps<{
  startDate: string;
  startTime: string;
  frequency: Frequency;
  untilDate: string | null;
  recipientCount: number;
}>();

const debounced = ref({ ...props });
let timer: ReturnType<typeof setTimeout> | undefined;

watch(
  () =>
    [
      props.startDate,
      props.startTime,
      props.frequency,
      props.untilDate,
      props.recipientCount,
    ] as const,
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      debounced.value = { ...props };
    }, 300);
  },
  { immediate: true },
);

const enabled = computed(
  () =>
    /^\d{4}-\d{2}-\d{2}$/.test(debounced.value.startDate) &&
    /^\d{2}:\d{2}$/.test(debounced.value.startTime),
);

const {
  data: preview,
  isError,
  isFetching,
} = useQuery({
  queryKey: computed(() => [
    'preview',
    debounced.value.startDate,
    debounced.value.startTime,
    debounced.value.frequency,
    debounced.value.untilDate,
  ]),
  enabled,
  queryFn: () =>
    api.preview({
      start: debounced.value.startDate,
      time: debounced.value.startTime,
      frequency: debounced.value.frequency,
      until:
        debounced.value.frequency === 'none' ? undefined : (debounced.value.untilDate ?? undefined),
    }),
});

const rows = computed(() =>
  (preview.value?.occurrences ?? []).map((item) => formatLocal(item.localDate, item.localTime)),
);
</script>

<template>
  <div class="preview">
    <h4>
      Xem trước lịch gửi
      <template v-if="recipientCount"> · khoảng {{ recipientCount }} người nhận</template>
    </h4>
    <template v-if="!startDate">Chọn ngày gửi đầu tiên để xem các lần gửi sắp tới.</template>
    <template v-else-if="isError">Không tính được lịch gửi.</template>
    <template v-else-if="rows.length">
      <ol>
        <li v-for="row in rows" :key="`${row.date}-${row.time}`">
          {{ row.date }} lúc {{ row.time }} <span class="muted">({{ row.relative }})</span>
        </li>
      </ol>
      <div v-if="frequency !== 'none' && rows.length === 4" class="more">
        và tiếp tục theo chu kỳ…
      </div>
    </template>
    <span v-else-if="!isFetching" class="past">
      Thời điểm này đã qua nên email sẽ không được gửi. Chọn ngày khác.
    </span>
    <span v-else>Đang tính lịch gửi…</span>
  </div>
</template>
