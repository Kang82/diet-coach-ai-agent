// Workers AI 공급자 등록 (tasks.md B14 T8-7). 생성된 기본 등록 대신 이 등록을 쓴다(생성된 등록은 hasProvider로 건너뜀).
// 게이트웨이(default)·무응답 5분은 기본값 그대로이고, 모델별로 출력 상한과 요청 본문 보정을 넣는다(output-caps.ts).
// 'cloudflare:workers'를 쓰므로 단위 테스트에서 불러오는 파일에서는 import하지 않는다. app.ts가 맨 위에서 불러온다.
import { setProvider } from '@flue/runtime';
import { cloudflareBindingProvider } from '@flue/runtime/cloudflare/workers-ai';
import { env } from 'cloudflare:workers';
import { capsByWorkersAiId, PAYLOAD_FIXES, withOutputCaps } from './output-caps.ts';

type AiBinding = Parameters<typeof cloudflareBindingProvider>[0]['binding'];

setProvider(withOutputCaps(cloudflareBindingProvider({ binding: (env as { AI: AiBinding }).AI }), capsByWorkersAiId(), PAYLOAD_FIXES));
