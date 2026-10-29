<script setup lang="ts">
import { IconRefresh } from '@tabler/icons-vue';
import {
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import { ref } from 'vue';
import type { Delivery } from '../types';

defineProps<{ item: Delivery; busy: boolean }>();
const emit = defineEmits<{ confirm: [] }>();
const open = ref(false);

function confirm() {
  open.value = false;
  emit('confirm');
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger
      class="retry-btn"
      type="button"
      :disabled="busy"
      :aria-label="`Gửi lại ${item.title}`"
    >
      <IconRefresh :size="14" :class="{ spin: busy }" />
      {{ busy ? 'Đang gửi lại…' : 'Gửi lại' }}
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        class="retry-pop"
        side="left"
        align="center"
        :side-offset="8"
        :collision-padding="12"
      >
        <b>Gửi lại thông báo này?</b>
        <p>
          “{{ item.title }}” sẽ được gửi ngay bây giờ tới đúng danh sách người nhận hiện tại của
          lịch. Lần gửi mới được ghi thành một dòng riêng trong lịch sử.
        </p>
        <div class="retry-pop-actions">
          <PopoverClose class="btn" type="button">Hủy</PopoverClose>
          <button class="btn primary" type="button" @click="confirm">
            <IconRefresh :size="15" /> Gửi lại
          </button>
        </div>
        <PopoverArrow class="retry-pop-arrow" :width="12" :height="6" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
