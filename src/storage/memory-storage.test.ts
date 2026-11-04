import { MemoryStorage } from './memory-storage.ts';
import { storageContract } from './storage-contract.ts';

storageContract('MemoryStorage', () => new MemoryStorage());
