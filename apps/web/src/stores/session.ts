import { defineStore } from 'pinia';

const LOGGED_OUT = 'phat-tin-logged-out';
export const DEV_EMAIL_KEY = 'phat-tin-dev-email';

export const useSessionStore = defineStore('session', {
  state: () => ({
    loggedIn: sessionStorage.getItem(LOGGED_OUT) !== '1',
    devEmail: sessionStorage.getItem(DEV_EMAIL_KEY) ?? '',
  }),
  actions: {
    login(email?: string) {
      if (email) {
        sessionStorage.setItem(DEV_EMAIL_KEY, email);
        this.devEmail = email;
      }
      sessionStorage.removeItem(LOGGED_OUT);
      this.loggedIn = true;
    },
    logout() {
      sessionStorage.setItem(LOGGED_OUT, '1');
      sessionStorage.removeItem(DEV_EMAIL_KEY);
      this.loggedIn = false;
      this.devEmail = '';
    },
  },
});
