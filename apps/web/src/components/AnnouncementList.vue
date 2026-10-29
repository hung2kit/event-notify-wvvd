<script setup lang="ts">
import { IconMailOff } from '@tabler/icons-vue';
import AnnouncementRow from './AnnouncementRow.vue';
import type { Announcement } from '../types';

defineProps<{
  items: Announcement[];
  loading: boolean;
  error: boolean;
  canToggle: boolean;
  canCreate: boolean;
  canEdit: (item: Announcement) => boolean;
}>();
const emit = defineEmits<{
  toggle: [item: Announcement, value: boolean];
  edit: [item: Announcement];
  create: [];
  retry: [];
}>();
</script>

<template>
  <div class="panel">
    <div class="thead">
      <span>Bật</span><span>Thông báo</span><span>Chu kỳ</span><span>Lần gửi kế tiếp</span
      ><span></span>
    </div>
    <div v-if="loading" class="skeleton-list">
      <div v-for="index in 4" :key="index" class="skel-row"></div>
    </div>
    <div v-else-if="error" class="empty">
      Không tải được danh sách.
      <br />
      <button class="btn" type="button" @click="emit('retry')">Thử lại</button>
    </div>
    <div v-else-if="items.length === 0" class="empty">
      <IconMailOff :size="34" />
      Không có thông báo nào khớp bộ lọc.
      <br />
      <button v-if="canCreate" class="btn" type="button" @click="emit('create')">
        Tạo thông báo mới
      </button>
    </div>
    <template v-else>
      <AnnouncementRow
        v-for="item in items"
        :key="item.id"
        :item="item"
        :disabled="!canToggle"
        :can-edit="canEdit(item)"
        @toggle="emit('toggle', item, $event)"
        @edit="emit('edit', item)"
      />
    </template>
  </div>
</template>
