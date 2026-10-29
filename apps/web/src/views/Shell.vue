<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppFooter from '../components/AppFooter.vue';
import AppHeader from '../components/AppHeader.vue';
</script>

<template>
  <div class="shell">
    <AppHeader />
    <main>
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>
