import { cloudflare } from '@cloudflare/vite-plugin';
import { flue, flueWorkerConfig } from '@flue/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// flue()는 cloudflare()보다 앞에 둬야 한다 (Flue Cloudflare 배포 가이드).
// react()는 화면(src/ui, 클라이언트 빌드)용이다. 클라이언트와 Worker 빌드는 cloudflare()가 함께 처리한다 (스펙 7.1).
export default defineConfig({
  plugins: [react(), flue(), cloudflare({ config: flueWorkerConfig() })],
});
