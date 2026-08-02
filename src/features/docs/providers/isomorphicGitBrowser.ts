import { Buffer } from 'buffer';
import type gitModule from 'isomorphic-git';

// isomorphic-git 会直接使用全局 Buffer，但 Vite 不会自动提供 Node polyfill。
// 必须先注入，再动态导入 Git 模块，避免其将已存在对象误判为不可读取。
const browserGlobal = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
browserGlobal.Buffer ??= Buffer;

const gitRuntime = import('isomorphic-git').then(({ default: git }) => git as typeof gitModule);

export function getBrowserGit(): Promise<typeof gitModule> {
  return gitRuntime;
}
