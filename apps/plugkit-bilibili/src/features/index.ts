// features 注册表与加载器：content-ui.ts(document_idle) 调用，
// 按 settings 开关启用各功能模块（静态导入，保证 MV3 content 打包稳定）
import { BiliSettings } from '../shared/types';
import { settingsStore } from './util';
import { startAdClean } from './ad-clean';
import { startPlayerEnhance } from './player-enhance';
import { startDanmaku } from './danmaku';
import { startAccountTools } from './account';

export async function loadFeatures(): Promise<void> {
  const s = await settingsStore.get();
  if (s.adClean) startAdClean();
  if (s.playerEnhance) startPlayerEnhance(s);
  if (s.danmaku) startDanmaku(s);
  if (s.accountTools) startAccountTools(s);
}

export type { BiliSettings };
