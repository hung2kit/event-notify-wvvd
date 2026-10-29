<script setup lang="ts">
import { IconAlertTriangle, IconCheck, IconChevronRight } from '@tabler/icons-vue';
import { ref } from 'vue';
import { formatInstant } from '../lib/format';
import type { Delivery } from '../types';
import DeliveryDetailDialog from './DeliveryDetailDialog.vue';
import RetryButton from './RetryButton.vue';

defineProps<{
  items: Delivery[];
  loading: boolean;
  error: boolean;
  canRetry: (item: Delivery) => boolean;
  resending: string | null;
}>();
const emit = defineEmits<{ retry: []; resend: [id: string] }>();
const selected = ref<Delivery | null>(null);

const REASON: Record<string, string> = {
  'paused or deleted': 'Lịch đã tạm dừng hoặc bị xoá',
  'missed while offline': 'Hệ thống tắt quá lâu',
};

function when(item: Delivery) {
  return formatInstant(item.sentAt ?? item.scheduledFor);
}

function label(item: Delivery): { kind: 'on' | 'off' | 'bad' | 'wait'; text: string } {
  if (item.status === 'sent') return { kind: 'on', text: 'Đã gửi' };
  if (item.status === 'failed') return { kind: 'bad', text: 'Lỗi máy chủ mail' };
  if (item.status === 'skipped') return { kind: 'off', text: 'Đã bỏ qua' };
  return { kind: 'wait', text: 'Đang gửi' };
}

function hasDetail(item: Delivery) {
  return item.status !== 'sent' || Boolean(item.errorDetail?.attempts.length);
}

function reason(item: Delivery) {
  if (!item.lastError) return '';
  const latest = item.errorDetail?.attempts.at(-1);
  const base = REASON[item.lastError] ?? item.lastError;
  return latest?.responseCode ? `${base} (${latest.responseCode})` : base;
}
</script>

<template>
  <div class="panel">
    <div v-if="loading" class="skeleton-list">
      <div v-for="index in 4" :key="index" class="skel-row"></div>
    </div>
    <div v-else-if="error" class="empty">
      Không tải được lịch sử.
      <br />
      <button class="btn" type="button" @click="emit('retry')">Thử lại</button>
    </div>
    <div v-else-if="items.length === 0" class="empty">Chưa có email nào được gửi.</div>
    <table v-else class="tbl">
      <thead>
        <tr>
          <th>Thời gian</th>
          <th>Thông báo</th>
          <th class="hide-sm">Gửi đến</th>
          <th class="hide-sm">Số người nhận</th>
          <th>Kết quả</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>
            {{ when(item).date }}<br />
            <span class="muted">{{ when(item).time }}</span>
            <small v-if="item.retryOf" class="resend-mark">Gửi lại thủ công</small>
          </td>
          <td class="cell-wrap">{{ item.title }}</td>
          <td class="hide-sm cell-wrap">
            {{
              [...item.groups.map((group) => group.name), ...(item.recipientEmails ?? [])].join(
                ', ',
              )
            }}
          </td>
          <td class="hide-sm">{{ item.recipientCount }} người</td>
          <td class="result-cell">
            <button
              v-if="hasDetail(item)"
              type="button"
              class="result-btn"
              :aria-label="`Xem chi tiết: ${label(item).text}`"
              @click="selected = item"
            >
              <span class="tag" :class="label(item).kind">
                <IconCheck v-if="label(item).kind === 'on'" :size="13" />
                <IconAlertTriangle v-else-if="label(item).kind === 'bad'" :size="13" />
                {{ label(item).text }}
              </span>
              <IconChevronRight :size="14" class="result-chevron" />
            </button>
            <span v-else class="tag" :class="label(item).kind">
              <IconCheck v-if="label(item).kind === 'on'" :size="13" />
              {{ label(item).text }}
            </span>
            <small v-if="reason(item)" class="result-reason" :title="reason(item)">
              {{ reason(item) }}
            </small>
            <RetryButton
              v-if="canRetry(item)"
              :item="item"
              :busy="resending === item.id"
              @confirm="emit('resend', item.id)"
            />
            <small v-else-if="item.retried" class="resend-mark">Đã gửi lại</small>
          </td>
        </tr>
      </tbody>
    </table>
    <DeliveryDetailDialog :delivery="selected" @close="selected = null" />
  </div>
</template>
