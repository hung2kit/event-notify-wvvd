<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import BrandLogo from '../components/BrandLogo.vue';
import { ROLE_LABEL } from '../lib/roles';
import { useSessionStore } from '../stores/session';
import type { User } from '../types';

const session = useSessionStore();
const router = useRouter();
const accounts = ref<User[]>([]);
const loading = ref(true);
const failed = ref(false);

onMounted(async () => {
  try {
    accounts.value = (await api.devUsers()).users;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
});

function enter(email?: string) {
  session.login(email);
  void router.push('/');
}
</script>

<template>
  <div id="login">
    <div class="login-side">
      <BrandLogo variant="rev" />
      <div>
        <h1>Gửi thông báo nội bộ <span>đúng giờ.</span></h1>
        <p>Lịch gửi email tới các nhóm cán bộ, có thể tạm dừng ngay khi cần.</p>
      </div>
    </div>
    <div class="login-main">
      <div class="login-card">
        <BrandLogo variant="pri" />
        <h2>Đăng nhập</h2>
        <p class="sub">Chọn tài khoản phát triển. Mỗi vai trò chỉ thấy việc mà API cho phép.</p>
        <p v-if="loading" class="sub">Đang tải tài khoản…</p>
        <div v-else-if="accounts.length" class="account-list">
          <button
            v-for="account in accounts"
            :key="account.id"
            class="btn primary"
            type="button"
            @click="enter(account.email)"
          >
            <span>Tiếp tục với tư cách {{ account.displayName }}</span>
            <small>{{ ROLE_LABEL[account.role] }}</small>
          </button>
        </div>
        <button v-else class="btn primary" type="button" @click="enter()">
          Tiếp tục với tư cách Hạnh
        </button>
        <div class="demo">
          Quản trị sửa mọi lịch. Biên tập tạo lịch và chỉ sửa lịch của mình. Chỉ xem không tạo,
          không sửa.
          <template v-if="failed">Không tải được danh sách tài khoản.</template>
        </div>
      </div>
    </div>
  </div>
</template>
