import type { DonkorApi } from '../../preload';

declare global {
  interface Window {
    donkor: DonkorApi;
  }
}

export {};
