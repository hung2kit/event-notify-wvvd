<script setup lang="ts">
import { IconPencil, IconRepeat, IconUsers } from '@tabler/icons-vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { computed } from 'vue';
import { FREQUENCY_LABEL, formatInstant } from '../lib/format';
import type { Announcement } from '../types';

const props = defineProps<{ item: Announcement; disabled?: boolean; canEdit: boolean }>();
const emit = defineEmits<{ toggle: [value: boolean]; edit: [] }>();

const when = computed(() => (props.item.nextRunAt ? formatInstant(props.item.nextRunAt) : null));
const names = computed(() =>
  [...props.item.groups.map((group) => group.name), ...(props.item.recipientEmails ?? [])].join(
    ', ',
  ),
);

function onKey(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
  emit('edit');
}

function askToggle(next: boolean) {
  const question = next
    ? `Bật lịch gửi "${props.item.title}"? Email sẽ được gửi theo lịch đã đặt.`
    : `Tạm dừng lịch gửi "${props.item.title}"? Email sẽ không được gửi cho tới khi bạn bật lại.`;
  if (!window.confirm(question)) return;
  emit('toggle', next);
}
</script>

<template>
  <div
    class="ev"
    :class="{ paused: !item.isActive }"
    tabindex="0"
    @click="emit('edit')"
    @keydown="onKey"
  >
    <SwitchRoot
      class="sw"
      :model-value="item.isActive"
      :disabled="disabled"
      :aria-label="`${item.isActive ? 'Tạm dừng' : 'Bật'} ${item.title}`"
      @click.stop
      @update:model-value="askToggle(Boolean($event))"
    >
      <SwitchThumb class="sw-thumb" />
    </SwitchRoot>
    <div class="ev-main">
      <div class="ev-title" :title="item.title">{{ item.title }}</div>
      <div class="ev-sub">
        <IconUsers :size="14" />
        <span class="ev-sub-text" :title="names">{{ names }}</span>
      </div>
    </div>
    <div class="col-rep">
      <span class="tag rep"><IconRepeat :size="13" />{{ FREQUENCY_LABEL[item.frequency] }}</span>
    </div>
    <div class="when">
      <span v-if="!item.isActive" class="tag off">Đang tạm dừng</span>
      <template v-else-if="when">
        {{ when.date }} · {{ when.time }}
        <small>{{ when.relative }}</small>
      </template>
      <span v-else class="tag off">Đã hoàn tất</span>
    </div>
    <button
      class="icon-btn"
      type="button"
      :aria-label="`${canEdit ? 'Sửa' : 'Xem'} ${item.title}`"
      @click.stop="emit('edit')"
    >
      <IconPencil :size="18" />
    </button>
  </div>
</template>
