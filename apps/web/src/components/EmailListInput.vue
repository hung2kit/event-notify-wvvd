<script setup lang="ts">
import { IconX } from '@tabler/icons-vue';
import { ref, watch } from 'vue';

const props = defineProps<{
  id: string;
  placeholder: string;
  max: number;
  maxLabel: string;
  disabled?: boolean;
}>();
const emails = defineModel<string[]>({ required: true });

const draft = ref('');
const draftError = ref('');
const input = ref<HTMLInputElement>();
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function addFrom(text: string): boolean {
  const parts = text
    .split(/[\s,;]+/)
    .map((part) => part.trim().replace(/^<|>$/g, '').toLowerCase())
    .filter(Boolean);
  if (!parts.length) return true;
  const invalid = parts.filter((part) => !EMAIL.test(part));
  const next = [...emails.value];
  for (const part of parts) {
    if (EMAIL.test(part) && !next.includes(part)) next.push(part);
  }
  if (next.length > props.max) {
    draftError.value = `Tối đa ${props.max} địa chỉ ${props.maxLabel}`;
    return false;
  }
  emails.value = next;
  if (invalid.length) {
    draft.value = invalid.join(', ');
    draftError.value = `Địa chỉ không hợp lệ: ${invalid.join(', ')}`;
    return false;
  }
  draft.value = '';
  draftError.value = '';
  return true;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
    event.preventDefault();
    addFrom(draft.value);
    return;
  }
  if (event.key === 'Backspace' && !draft.value && emails.value.length) {
    emails.value = emails.value.slice(0, -1);
  }
}

function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? '';
  if (!/[\s,;]/.test(text.trim())) return;
  event.preventDefault();
  addFrom(`${draft.value} ${text}`);
}

function removeEmail(email: string) {
  if (props.disabled) return;
  emails.value = emails.value.filter((item) => item !== email);
}

function commit() {
  if (draft.value.trim()) addFrom(draft.value);
}

watch(draft, (value) => {
  const cut = value.search(/[\s,;][^\s,;]*$/);
  if (cut < 0) return;
  const head = value.slice(0, cut);
  const tail = value.slice(cut + 1);
  if (!head.trim()) {
    draft.value = tail;
    return;
  }
  if (addFrom(head)) {
    draft.value = tail;
  } else if (tail) {
    draft.value = `${draft.value} ${tail}`;
  }
});

defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <div class="email-box" :class="{ disabled }" @click="input?.focus()">
    <span v-for="email in emails" :key="email" class="email-pill">
      <span class="email-pill-text" :title="email">{{ email }}</span>
      <button
        v-if="!disabled"
        type="button"
        class="email-pill-x"
        :aria-label="`Bỏ ${email}`"
        @click.stop="removeEmail(email)"
      >
        <IconX :size="12" />
      </button>
    </span>
    <input
      :id="id"
      ref="input"
      v-model="draft"
      class="email-input"
      type="text"
      inputmode="email"
      autocomplete="off"
      :placeholder="emails.length ? 'Thêm địa chỉ…' : placeholder"
      :disabled="disabled"
      @keydown="onKeydown"
      @paste="onPaste"
      @blur="commit"
    />
  </div>
  <div class="err">{{ draftError }}</div>
</template>
