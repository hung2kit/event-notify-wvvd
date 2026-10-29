<script setup lang="ts">
import primaryDarkUrl from '../assets/logo-primary-dark.png';
import primaryUrl from '../assets/logo-primary.png';
import reverseUrl from '../assets/logo-reverse.png';

defineProps<{ variant: 'rev' | 'pri' }>();
</script>

<template>
  <img v-if="variant === 'rev'" class="wv-logo" :src="reverseUrl" alt="World Vision" />
  <picture v-else>
    <source media="(prefers-color-scheme: dark)" :srcset="primaryDarkUrl" />
    <img class="wv-logo" :src="primaryUrl" alt="World Vision" />
  </picture>
</template>
