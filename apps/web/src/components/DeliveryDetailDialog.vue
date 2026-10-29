<script setup lang="ts">
import { IconCopy, IconX } from '@tabler/icons-vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { computed } from 'vue';
import { formatInstant } from '../lib/format';
import { mailHint } from '../lib/mail-hints';
import { useToastStore } from '../stores/toast';
import type { Delivery } from '../types';

const props = defineProps<{ delivery: Delivery | null }>();
const emit = defineEmits<{ close: [] }>();
const toast = useToastStore();

const STATUS: Record<Delivery['status'], string> = {
  sent: 'Đã gửi',
  failed: 'Gửi lỗi',
  skipped: 'Đã bỏ qua',
  queued: 'Đang chờ gửi lại',
  sending: 'Đang gửi',
};

const REASON: Record<string, string> = {
  'paused or deleted': 'Lịch đã tạm dừng hoặc bị xoá',
  'missed while offline': 'Bỏ qua vì hệ thống tắt quá lâu',
};

const attempts = computed(() => [...(props.delivery?.errorDetail?.attempts ?? [])].reverse());
const latest = computed(() => attempts.value[0]);
const hint = computed(() => mailHint(latest.value, props.delivery?.lastError));

function stamp(iso: string) {
  const value = formatInstant(iso);
  return `${value.time} ${value.date}`;
}

async function copy() {
  const item = props.delivery;
  if (!item) return;
  const text = JSON.stringify(
    {
      deliveryId: item.id,
      announcementId: item.announcementId,
      title: item.title,
      scheduledFor: item.scheduledFor,
      status: item.status,
      attempts: item.attempts,
      lastError: item.lastError,
      errorDetail: item.errorDetail,
    },
    null,
    2,
  );
  try {
    await navigator.clipboard.writeText(text);
    toast.push('Đã sao chép chi tiết lỗi', 'check');
  } catch {
    toast.push('Trình duyệt không cho sao chép', 'alert');
  }
}
</script>

<template>
  <DialogRoot :open="Boolean(delivery)" @update:open="(open) => !open && emit('close')">
    <DialogPortal>
      <DialogOverlay class="scrim" />
      <DialogContent v-if="delivery" class="detail-dialog" aria-describedby="delivery-detail-help">
        <div class="compose-head">
          <DialogTitle>Chi tiết lần gửi</DialogTitle>
          <DialogClose class="icon-btn" aria-label="Đóng"><IconX :size="18" /></DialogClose>
        </div>
        <div class="detail-body">
          <DialogDescription id="delivery-detail-help" class="sr-only">
            Kết quả và thông tin kỹ thuật của lần gửi.
          </DialogDescription>
          <dl class="detail-grid">
            <dt>Thông báo</dt>
            <dd>{{ delivery.title }}</dd>
            <dt>Giờ gửi theo lịch</dt>
            <dd>{{ stamp(delivery.scheduledFor) }}</dd>
            <dt>Kết quả</dt>
            <dd>
              <span class="tag" :class="delivery.status === 'failed' ? 'bad' : 'off'">
                {{ STATUS[delivery.status] }}
              </span>
            </dd>
            <template v-if="delivery.lastError">
              <dt>Lý do</dt>
              <dd>{{ REASON[delivery.lastError] ?? delivery.lastError }}</dd>
            </template>
            <dt>Số lần thử</dt>
            <dd>{{ delivery.attempts }}</dd>
            <dt>Số người nhận</dt>
            <dd>{{ delivery.recipientCount }} người</dd>
          </dl>

          <div v-if="hint" class="detail-hint">
            <b>Gợi ý xử lý</b>
            <p>{{ hint }}</p>
          </div>

          <h4 class="detail-sub">Phản hồi từ máy chủ mail</h4>
          <p v-if="attempts.length === 0" class="muted">
            {{
              delivery.status === 'failed'
                ? 'Lần gửi này diễn ra trước khi hệ thống lưu chi tiết lỗi. Các lần lỗi sau sẽ có mã SMTP và câu trả lời của máy chủ ở đây.'
                : 'Không có lỗi kỹ thuật nào được ghi nhận.'
            }}
          </p>
          <ol v-else class="attempt-list">
            <li v-for="attempt in attempts" :key="`${attempt.attempt}-${attempt.at}`">
              <div class="attempt-head">
                <b>Lần thử {{ attempt.attempt }}</b>
                <span class="muted">{{ stamp(attempt.at) }}</span>
                <span class="tag" :class="attempt.permanent ? 'bad' : 'wait'">
                  {{ attempt.permanent ? 'Không thử lại' : 'Sẽ thử lại' }}
                </span>
              </div>
              <dl class="detail-grid tight">
                <dt>Tóm tắt</dt>
                <dd>{{ attempt.summary }}</dd>
                <template v-if="attempt.responseCode">
                  <dt>Mã SMTP</dt>
                  <dd>
                    <code>{{ attempt.responseCode }}</code>
                  </dd>
                </template>
                <template v-if="attempt.code">
                  <dt>Mã lỗi</dt>
                  <dd>
                    <code>{{ attempt.code }}</code>
                  </dd>
                </template>
                <template v-if="attempt.command">
                  <dt>Lệnh SMTP</dt>
                  <dd>
                    <code>{{ attempt.command }}</code>
                  </dd>
                </template>
                <template v-if="attempt.rejected?.length">
                  <dt>Địa chỉ bị từ chối</dt>
                  <dd>{{ attempt.rejected.join(', ') }}</dd>
                </template>
              </dl>
              <pre v-if="attempt.response || attempt.message" class="detail-log">{{
                [attempt.response, attempt.message].filter(Boolean).join('\n\n')
              }}</pre>
            </li>
          </ol>
        </div>
        <div class="compose-foot">
          <button class="btn ghost" type="button" @click="copy">
            <IconCopy :size="16" /> Sao chép chi tiết
          </button>
          <span class="spacer"></span>
          <DialogClose class="btn" type="button">Đóng</DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
