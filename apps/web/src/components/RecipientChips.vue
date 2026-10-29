<script setup lang="ts">
import { IconCheck, IconX } from '@tabler/icons-vue';
import { nextTick, ref, watch } from 'vue';
import type { Group } from '../types';
import EmailListInput from './EmailListInput.vue';

const props = defineProps<{ groups: Group[]; error?: string; disabled?: boolean }>();
const picked = defineModel<string[]>({ required: true });
const emails = defineModel<string[]>('emails', { required: true });
const cc = defineModel<string[]>('cc', { required: true });
const bcc = defineModel<string[]>('bcc', { required: true });

const ccOpen = ref(cc.value.length > 0);
const bccOpen = ref(bcc.value.length > 0);
const ccInput = ref<InstanceType<typeof EmailListInput>>();
const bccInput = ref<InstanceType<typeof EmailListInput>>();

watch(cc, (value) => {
  if (value.length) ccOpen.value = true;
});
watch(bcc, (value) => {
  if (value.length) bccOpen.value = true;
});

const allId = () =>
  props.groups.find((group) => group.emailAddress === 'wv-vn-all@worldvision.org.vn')?.id;

function toggle(id: string) {
  if (props.disabled) return;
  const everyone = allId();
  if (everyone && id === everyone) {
    picked.value = picked.value.includes(id) ? [] : [id];
    return;
  }
  const withoutAll = everyone ? picked.value.filter((item) => item !== everyone) : picked.value;
  picked.value = withoutAll.includes(id)
    ? withoutAll.filter((item) => item !== id)
    : [...withoutAll, id];
}

async function openCopy(kind: 'cc' | 'bcc') {
  if (kind === 'cc') ccOpen.value = true;
  else bccOpen.value = true;
  await nextTick();
  (kind === 'cc' ? ccInput : bccInput).value?.focus();
}

function closeCopy(kind: 'cc' | 'bcc') {
  if (kind === 'cc') {
    cc.value = [];
    ccOpen.value = false;
  } else {
    bcc.value = [];
    bccOpen.value = false;
  }
}
</script>

<template>
  <div class="field recipients">
    <span>Gửi đến</span>
    <div class="recipients-block">
      <small class="recipients-label">Nhóm có sẵn</small>
      <div v-if="groups.length" class="chips">
        <button
          v-for="group in groups"
          :key="group.id"
          type="button"
          class="chip"
          :class="{ act: picked.includes(group.id) }"
          :disabled="disabled"
          :title="group.emailAddress"
          :aria-pressed="picked.includes(group.id)"
          @click="toggle(group.id)"
        >
          <IconCheck v-if="picked.includes(group.id)" :size="14" />
          <span class="chip-text">{{ group.name }}</span>
        </button>
      </div>
      <p v-else class="muted">Chưa có nhóm nhận nào đang hoạt động.</p>
    </div>
    <div class="recipients-block">
      <div class="recipients-head">
        <label class="recipients-label" for="manual-recipients">Địa chỉ email nhập tay</label>
        <div v-if="!disabled && (!ccOpen || !bccOpen)" class="copy-toggles">
          <button v-if="!ccOpen" type="button" class="copy-toggle" @click="openCopy('cc')">
            CC
          </button>
          <button v-if="!bccOpen" type="button" class="copy-toggle" @click="openCopy('bcc')">
            BCC
          </button>
        </div>
      </div>
      <EmailListInput
        id="manual-recipients"
        v-model="emails"
        placeholder="ten@wvi.org, nhấn Enter để thêm"
        :max="50"
        max-label="nhập tay"
        :disabled="disabled"
      />
    </div>
    <div v-if="ccOpen" class="recipients-block">
      <div class="recipients-head">
        <label class="recipients-label" for="cc-recipients">CC</label>
        <button
          v-if="!disabled"
          type="button"
          class="copy-close"
          aria-label="Bỏ CC"
          title="Bỏ CC"
          @click="closeCopy('cc')"
        >
          <IconX :size="14" />
        </button>
      </div>
      <EmailListInput
        id="cc-recipients"
        ref="ccInput"
        v-model="cc"
        placeholder="Người nhận bản sao"
        :max="50"
        max-label="CC"
        :disabled="disabled"
      />
    </div>
    <div v-if="bccOpen" class="recipients-block">
      <div class="recipients-head">
        <label class="recipients-label" for="bcc-recipients">BCC</label>
        <button
          v-if="!disabled"
          type="button"
          class="copy-close"
          aria-label="Bỏ BCC"
          title="Bỏ BCC"
          @click="closeCopy('bcc')"
        >
          <IconX :size="14" />
        </button>
      </div>
      <EmailListInput
        id="bcc-recipients"
        ref="bccInput"
        v-model="bcc"
        placeholder="Người nhận bản sao ẩn, người khác không thấy"
        :max="50"
        max-label="BCC"
        :disabled="disabled"
      />
    </div>
    <p class="hint">
      Nếu không nhập địa chỉ, thư gửi tới nhóm đang chọn. Nhập thêm địa chỉ thì thư gửi tới cả hai.
    </p>
    <div class="err">{{ error }}</div>
  </div>
</template>
