import { defineStore } from 'pinia';

export type ToastIcon = 'check' | 'info' | 'alert' | 'send' | 'trash' | 'play' | 'pause';

type ToastItem = { id: number; message: string; icon: ToastIcon };

export const useToastStore = defineStore('toast', {
  state: () => ({ items: [] as ToastItem[] }),
  actions: {
    push(message: string, icon: ToastIcon = 'check') {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      this.items.push({ id, message, icon });
      window.setTimeout(() => {
        this.items = this.items.filter((item) => item.id !== id);
      }, 2600);
    },
  },
});
