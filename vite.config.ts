import { cloudflare } from '@cloudflare/vite-plugin';
import { flue, flueWorkerConfig } from '@flue/vite';
import { defineConfig } from 'vite';

// flue()는 cloudflare()보다 앞에 둬야 한다 (Flue Cloudflare 배포 가이드).
export default defineConfig({
  plugins: [flue(), cloudflare({ config: flueWorkerConfig() })],
});
