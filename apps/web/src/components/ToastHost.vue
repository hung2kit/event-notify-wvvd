<script setup lang="ts">
import {
  IconAlertCircle,
  IconCheck,
  IconInfoCircle,
  IconPlayerPause,
  IconPlayerPlay,
  IconSend,
  IconTrash,
} from '@tabler/icons-vue';
import { storeToRefs } from 'pinia';
import { useToastStore, type ToastIcon } from '../stores/toast';

const { items } = storeToRefs(useToastStore());

const icons: Record<ToastIcon, typeof IconCheck> = {
  check: IconCheck,
  info: IconInfoCircle,
  alert: IconAlertCircle,
  send: IconSend,
  trash: IconTrash,
  play: IconPlayerPlay,
  pause: IconPlayerPause,
};
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div v-for="item in items" :key="item.id" class="toast">
      <component :is="icons[item.icon]" :size="18" />
      {{ item.message }}
    </div>
  </div>
</template>
