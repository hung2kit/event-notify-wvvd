<script setup lang="ts">
import { IconBuilding, IconMap2, IconMapPin, IconReportMoney, IconSpeakerphone, IconUsers } from '@tabler/icons-vue';
import type { Component } from 'vue';
import type { Announcement, Group } from '../types';

defineProps<{ groups: Group[]; announcements: Announcement[]; loading: boolean; error: boolean }>();
const emit = defineEmits<{ retry: [] }>();

const icons: Record<string, Component> = {
  'wv-vn-all@worldvision.org.vn': IconBuilding,
  'wv-vn-hanoi@worldvision.org.vn': IconMapPin,
  'wv-vn-adp@worldvision.org.vn': IconMap2,
  'wv-vn-finance@worldvision.org.vn': IconReportMoney,
  'wv-vn-comms@worldvision.org.vn': IconSpeakerphone,
  'wv-vn-leadership@worldvision.org.vn': IconUsers,
};

function iconFor(group: Group): Component {
  return icons[group.emailAddress] ?? IconUsers;
}

function used(group: Group, announcements: Announcement[]): number {
  return announcements.filter((item) => item.groups.some((link) => link.id === group.id)).length;
}
</script>

<template>
  <div v-if="loading" class="groups">
    <div v-for="index in 6" :key="index" class="group skel-card"></div>
  </div>
  <div v-else-if="error" class="empty">
    Không tải được nhóm nhận.
    <br />
    <button class="btn" type="button" @click="emit('retry')">Thử lại</button>
  </div>
  <div v-else class="groups">
    <div v-for="group in groups" :key="group.id" class="group">
      <h3>
        <component :is="iconFor(group)" :size="20" class="group-icon" />
        {{ group.name }}
      </h3>
      <p>{{ group.description }}</p>
      <div class="count">
        <span>{{ group.memberCount }} thành viên</span>
        <span>{{ used(group, announcements) }} lịch gửi</span>
      </div>
    </div>
  </div>
</template>
