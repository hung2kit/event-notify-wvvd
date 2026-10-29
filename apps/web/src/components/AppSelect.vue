<script setup lang="ts">
import { IconChevronDown } from '@tabler/icons-vue';
import {
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui';

defineProps<{
  label: string;
  options: { value: string; label: string }[];
  compact?: boolean;
  disabled?: boolean;
}>();

const model = defineModel<string>({ required: true });
</script>

<template>
  <SelectRoot v-model="model" :disabled="disabled">
    <SelectTrigger class="input select-trigger" :class="{ compact }" :aria-label="label">
      <SelectValue />
      <IconChevronDown :size="16" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent class="select-menu" position="popper" :side-offset="6">
        <SelectViewport>
          <SelectItem
            v-for="option in options"
            :key="option.value"
            class="select-item"
            :value="option.value"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
