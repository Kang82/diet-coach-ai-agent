// D1Storage 계약 테스트. 로컬 D1은 __fixtures__/local-d1.ts (getPlatformProxy).
import { useLocalD1 } from './__fixtures__/local-d1.ts';
import { D1Storage } from './d1-storage.ts';
import { storageContract } from './storage-contract.ts';

const local = useLocalD1();

storageContract('D1Storage', async () => {
  await local.reset(['profiles', 'plans']);
  return new D1Storage(local.db());
});
