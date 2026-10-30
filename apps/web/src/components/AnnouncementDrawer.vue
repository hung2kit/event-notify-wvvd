<script setup lang="ts">
import { announcementWriteSchema, type Frequency } from '@event-notify/shared/schema';
import { IconLoader2, IconSend, IconTrash, IconX } from '@tabler/icons-vue';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { useForm } from 'vee-validate';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  SwitchRoot,
  SwitchThumb,
} from 'reka-ui';
import { computed, onBeforeUnmount, watch } from 'vue';
import { ApiError, api } from '../api';
import { hasContent } from '../lib/format';
import { useToastStore } from '../stores/toast';
import type { Announcement, Group } from '../types';
import AppSelect from './AppSelect.vue';
import BodyEditor from './BodyEditor.vue';
import RecipientChips from './RecipientChips.vue';
import SchedulePreview from './SchedulePreview.vue';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{
  announcement: Announcement | null;
  groups: Group[];
  canEdit: boolean;
  canTest: boolean;
}>();
const toast = useToastStore();
const queryClient = useQueryClient();
const frequencyOptions = [
  { value: 'none', label: 'Không lặp, gửi một lần' },
  { value: 'daily', label: 'Hằng ngày' },
  { value: 'weekdays', label: 'Các ngày làm việc (T2–T6)' },
  { value: 'weekly', label: 'Hằng tuần' },
  { value: 'monthly', label: 'Hằng tháng' },
  { value: 'yearly', label: 'Hằng năm' },
];

const { errors, defineField, resetForm, setErrors, values } = useForm({
  initialValues: emptyValues(),
});
const [title] = defineField('title');
const [bodyHtml] = defineField('bodyHtml');
const [groupIds] = defineField('groupIds');
const [recipientEmails] = defineField('recipientEmails');
const [ccEmails] = defineField('ccEmails');
const [bccEmails] = defineField('bccEmails');
const [startDate] = defineField('startDate');
const [startTime] = defineField('startTime');
const [frequency] = defineField('frequency');
const [untilDate] = defineField('untilDate');
const [isActive] = defineField('isActive');

watch(
  () => [open.value, props.announcement?.id, props.announcement?.version] as const,
  () => {
    if (!open.value) return;
    const item = props.announcement;
    resetForm({
      values: item
        ? {
            title: item.title,
            bodyHtml: item.bodyHtml,
            groupIds: item.groups.map((group) => group.id),
            recipientEmails: [...(item.recipientEmails ?? [])],
            ccEmails: [...(item.ccEmails ?? [])],
            bccEmails: [...(item.bccEmails ?? [])],
            startDate: item.startDate,
            startTime: item.startTime,
            frequency: item.frequency,
            untilDate: item.untilDate,
            isActive: item.isActive,
          }
        : emptyValues(),
    });
  },
);

const recipientCount = computed(() => {
  const chosen = props.groups.filter((group) => (groupIds.value ?? []).includes(group.id));
  const groupAddresses = new Set(chosen.map((group) => group.emailAddress.toLowerCase()));
  const manual = (recipientEmails.value ?? []).filter((email) => !groupAddresses.has(email));
  const taken = new Set([...groupAddresses, ...manual]);
  const copies = [...(ccEmails.value ?? []), ...(bccEmails.value ?? [])].filter((email) => {
    if (taken.has(email)) return false;
    taken.add(email);
    return true;
  });
  return chosen.reduce((sum, group) => sum + group.memberCount, 0) + manual.length + copies.length;
});
const activeHint = computed(() => {
  if (!props.announcement)
    return 'Lịch mới được lưu ở trạng thái tắt. Bật gửi ở danh sách sau khi kiểm tra.';
  return isActive.value
    ? 'Email sẽ được gửi theo lịch bên dưới.'
    : 'Đang tạm dừng, sẽ không gửi cho tới khi bật lại.';
});

function onActiveChange(next: boolean) {
  if (!props.canEdit || !props.announcement || next === Boolean(isActive.value)) return;
  const question = next
    ? `Bật lịch gửi "${props.announcement.title}" khi lưu?`
    : `Tạm dừng lịch gửi "${props.announcement.title}" khi lưu?`;
  if (!window.confirm(question)) return;
  isActive.value = next;
}

const { mutate: save, isPending: saving } = useMutation({
  mutationFn: async () => {
    if (!props.canEdit) throw new Error('readonly');
    const payload = {
      title: values.title,
      bodyHtml: hasContent(values.bodyHtml ?? '') ? values.bodyHtml : '',
      groupIds: values.groupIds ?? [],
      recipientEmails: values.recipientEmails ?? [],
      ccEmails: values.ccEmails ?? [],
      bccEmails: values.bccEmails ?? [],
      startDate: values.startDate,
      startTime: values.startTime,
      frequency: values.frequency,
      untilDate: values.frequency === 'none' ? null : values.untilDate || null,
      isActive: props.announcement ? Boolean(values.isActive) : false,
    };
    const parsed = announcementWriteSchema.safeParse(payload);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !fields[key]) fields[key] = issue.message;
      }
      setErrors(fields);
      throw new Error('invalid');
    }
    if (props.announcement) {
      return api.update(props.announcement.id, {
        ...parsed.data,
        version: props.announcement.version,
      });
    }
    return api.create(parsed.data);
  },
  onSuccess: () => {
    toast.push(props.announcement ? 'Đã lưu thay đổi' : 'Đã tạo lịch gửi');
    open.value = false;
    void queryClient.invalidateQueries({ queryKey: ['announcements'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  },
  onError: (error) => {
    if (error instanceof Error && (error.message === 'invalid' || error.message === 'readonly'))
      return;
    if (error instanceof ApiError) {
      if (error.fields) setErrors(error.fields);
      toast.push(error.message, 'alert');
      return;
    }
    toast.push('Không lưu được lịch gửi.', 'alert');
  },
});

const { mutate: remove } = useMutation({
  mutationFn: () => api.remove(props.announcement?.id ?? ''),
  onSuccess: () => {
    toast.push('Đã xóa thông báo', 'trash');
    open.value = false;
    void queryClient.invalidateQueries({ queryKey: ['announcements'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
    void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
  },
  onError: (error) => {
    toast.push(error instanceof ApiError ? error.message : 'Không xóa được thông báo.', 'alert');
  },
});

function onDelete() {
  if (!props.canEdit || !props.announcement) return;
  if (
    !window.confirm(
      `Xóa thông báo "${props.announcement.title}"? Thao tác này không hoàn tác được.`,
    )
  )
    return;
  remove();
}

const { mutate: sendTest, isPending: testing } = useMutation({
  mutationFn: (id: string) => api.testSend(id),
  onSuccess: (result) => toast.push(`Đã gửi thử tới ${result.to}`, 'send'),
  onError: (error) => {
    if (!(error instanceof ApiError)) {
      toast.push('Không gửi được email thử', 'alert');
      return;
    }
    const reason = error.detail?.response ?? error.detail?.message;
    toast.push(reason ? `${error.message}: ${reason}` : error.message, 'alert');
  },
});

const busy = computed(() => Boolean(saving.value || testing.value));

function keepPageOpen(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = '';
}

function keepDrawerOpen(event: Event) {
  if (busy.value) event.preventDefault();
}

watch(busy, (locked) => {
  if (locked) window.addEventListener('beforeunload', keepPageOpen);
  else window.removeEventListener('beforeunload', keepPageOpen);
});

onBeforeUnmount(() => window.removeEventListener('beforeunload', keepPageOpen));

function onTest() {
  if (!props.canTest || busy.value) return;
  if (!props.announcement) {
    toast.push('Lưu lịch gửi trước khi gửi thử', 'alert');
    return;
  }
  sendTest(props.announcement.id);
}

function emptyValues() {
  return {
    title: '',
    bodyHtml: '',
    groupIds: [] as string[],
    recipientEmails: [] as string[],
    ccEmails: [] as string[],
    bccEmails: [] as string[],
    startDate: '',
    startTime: '08:00',
    frequency: 'none' as Frequency,
    untilDate: null as string | null,
    isActive: false,
  };
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="scrim" />
      <DialogContent
        class="compose"
        aria-describedby="drawer-help"
        @escape-key-down="keepDrawerOpen"
        @pointer-down-outside="keepDrawerOpen"
        @interact-outside="keepDrawerOpen"
      >
        <div class="compose-head">
          <DialogTitle>{{
            announcement ? (canEdit ? 'Sửa thông báo' : 'Xem thông báo') : 'Tạo thông báo'
          }}</DialogTitle>
          <DialogClose class="icon-btn" aria-label="Đóng" :disabled="busy">
            <IconX :size="18" />
          </DialogClose>
        </div>
        <div class="compose-body">
          <DialogDescription id="drawer-help" class="sr-only">
            Nhập tiêu đề, nhóm nhận, nội dung và lịch gửi.
          </DialogDescription>
          <div class="compose-layout">
            <div class="compose-main">
              <div class="active-row">
                <div>
                  <b>Kích hoạt lịch gửi</b>
                  <small>{{ activeHint }}</small>
                </div>
                <SwitchRoot
                  class="sw"
                  :model-value="Boolean(isActive)"
                  :disabled="!announcement || !canEdit"
                  aria-label="Bật hoặc tắt lịch gửi"
                  @update:model-value="onActiveChange(Boolean($event))"
                >
                  <SwitchThumb class="sw-thumb" />
                </SwitchRoot>
              </div>
              <label class="field">
                <span>Tiêu đề email</span>
                <input
                  v-model="title"
                  class="input"
                  placeholder="Lịch nghỉ lễ Quốc khánh 2/9"
                  :disabled="!canEdit"
                />
                <div class="err">{{ errors.title }}</div>
              </label>
              <RecipientChips
                :model-value="groupIds ?? []"
                :emails="recipientEmails ?? []"
                :cc="ccEmails ?? []"
                :bcc="bccEmails ?? []"
                :groups="groups"
                :error="
                  errors.groupIds || errors.recipientEmails || errors.ccEmails || errors.bccEmails
                "
                :disabled="!canEdit"
                @update:model-value="groupIds = $event"
                @update:emails="recipientEmails = $event"
                @update:cc="ccEmails = $event"
                @update:bcc="bccEmails = $event"
              />
              <div class="field compose-editor">
                <span>Nội dung</span>
                <BodyEditor
                  v-if="open"
                  :key="announcement?.id ?? 'new'"
                  :model-value="bodyHtml ?? ''"
                  :disabled="!canEdit"
                  @update:model-value="bodyHtml = $event"
                />
                <div class="err">{{ errors.bodyHtml }}</div>
              </div>
            </div>
            <aside class="compose-side">
              <div class="grid2">
                <label class="field">
                  <span>Ngày gửi đầu tiên</span>
                  <input v-model="startDate" class="input" type="date" :disabled="!canEdit" />
                  <div class="err">{{ errors.startDate }}</div>
                </label>
                <label class="field">
                  <span>Giờ gửi</span>
                  <input v-model="startTime" class="input" type="time" :disabled="!canEdit" />
                </label>
                <label class="field field-wide">
                  <span>Lặp lại</span>
                  <AppSelect
                    :model-value="frequency ?? 'none'"
                    label="Lặp lại"
                    :options="frequencyOptions"
                    :disabled="!canEdit"
                    @update:model-value="frequency = $event as Frequency"
                  />
                </label>
                <label class="field field-wide" :class="{ dim: frequency === 'none' }">
                  <span>Ngừng lặp sau ngày</span>
                  <input
                    class="input"
                    type="date"
                    :value="untilDate ?? ''"
                    :disabled="!canEdit || frequency === 'none'"
                    @input="untilDate = ($event.target as HTMLInputElement).value || null"
                  />
                  <div class="err">{{ errors.untilDate }}</div>
                </label>
              </div>
              <SchedulePreview
                :start-date="startDate ?? ''"
                :start-time="startTime ?? '08:00'"
                :frequency="frequency ?? 'none'"
                :until-date="untilDate || null"
                :recipient-count="recipientCount"
              />
            </aside>
          </div>
        </div>
        <div class="compose-foot">
          <button
            v-if="announcement && canEdit"
            class="btn ghost danger"
            type="button"
            :disabled="busy"
            @click="onDelete"
          >
            <IconTrash :size="18" />Xóa
          </button>
          <button
            v-if="canTest"
            class="btn ghost test-btn"
            type="button"
            :disabled="busy"
            :aria-busy="testing"
            @click="onTest"
          >
            <IconLoader2 v-if="testing" class="spin" :size="18" />
            <IconSend v-else :size="18" />
            {{ testing ? 'Đang gửi…' : 'Gửi thử cho tôi' }}
          </button>
          <DialogClose class="btn" type="button" :disabled="busy">Hủy</DialogClose>
          <button
            v-if="canEdit"
            class="btn primary"
            type="button"
            :disabled="busy"
            :aria-busy="saving"
            @click="save()"
          >
            <IconLoader2 v-if="saving" class="spin" :size="18" />
            {{ saving ? 'Đang lưu…' : 'Lưu lịch gửi' }}
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
