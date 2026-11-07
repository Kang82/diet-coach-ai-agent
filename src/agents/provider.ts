// Workers AI 공급자 등록 (tasks.md B14 T8-7). 생성된 기본 등록 대신 이 등록을 쓴다(나중 등록이 이긴다).
// 게이트웨이(default)·무응답 5분은 기본값 그대로이고, 출력 상한이 256토큰인 모델에만 상한을 넣는다(output-caps.ts).
// 'cloudflare:workers'를 쓰므로 단위 테스트에서 불러오는 파일에서는 import하지 않는다. app.ts가 맨 위에서 불러온다.
import { setProvider } from '@flue/runtime';
import { cloudflareBindingProvider } from '@flue/runtime/cloudflare/workers-ai';
import { env } from 'cloudflare:workers';
import { OUTPUT_CAPS, withOutputCaps } from './output-caps.ts';

setProvider(withOutputCaps(cloudflareBindingProvider({ binding: (env as { AI: Parameters<typeof cloudflareBindingProvider>[0]['binding'] }).AI }), OUTPUT_CAPS));
