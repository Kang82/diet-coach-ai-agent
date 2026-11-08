// Workers AI 공급자 등록 (tasks.md B14 T8-7). 생성된 기본 등록 대신 이 등록을 쓴다(생성된 등록은 hasProvider로 건너뜀).
// 게이트웨이(default)·무응답 5분은 기본값 그대로이고, 모델별로 출력 상한과 요청 본문 보정을 넣는다(output-caps.ts).
// 바인딩은 응답 스트림 관찰용으로 감싼다(stream-watch.ts, B19).
// 'cloudflare:workers'를 쓰므로 단위 테스트에서 불러오는 파일에서는 import하지 않는다. app.ts가 맨 위에서 불러온다.
import { setProvider } from '@flue/runtime';
import { cloudflareBindingProvider } from '@flue/runtime/cloudflare/workers-ai';
import { env } from 'cloudflare:workers';
import { capsByWorkersAiId, PAYLOAD_FIXES, withOutputCaps } from './output-caps.ts';
import { watchBinding } from './stream-watch.ts';

type AiBinding = Parameters<typeof cloudflareBindingProvider>[0]['binding'];

// 바인딩은 응답 바이트 시각을 재는 감싼 것을 쓴다 (B19, stream-watch.ts). 시간 초과가 모델 무응답인지 가린다
const binding = watchBinding((env as { AI: AiBinding }).AI);
setProvider(withOutputCaps(cloudflareBindingProvider({ binding }), capsByWorkersAiId(), PAYLOAD_FIXES));
