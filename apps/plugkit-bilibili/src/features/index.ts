// features 注册表与加载器：ui.content.ts(document_idle) 调用，
// 按 settings 开关启用各功能模块（静态导入，保证 MV3 content 打包稳定）
import { BiliSettings } from '../shared/types';
import { settingsStore } from './util';
import { startAdClean } from './ad-clean';
import { startPlayerEnhance } from './player-enhance';
import { startDanmaku } from './danmaku';
import { startAccountTools } from './account';
import { startPreciseStats } from './precise-stats';
import { startNightMode } from './night-mode';
import { startDownloadTools } from './download';
import { startStatsFlusher } from './stats-bus';

export async function loadFeatures(): Promise<void> {
  const s = await settingsStore.get();

  // 统计落库的唯一写者：与具体功能开关无关，必须常驻，
  // 否则 content.ts 侧累加的 P2P 计数永远没人写进 storage。
  startStatsFlusher();

  if (s.adClean) startAdClean();
  if (s.playerEnhance) startPlayerEnhance(s);
  if (s.danmaku) startDanmaku(s);
  if (s.accountTools) startAccountTools(s);
  startPreciseStats(s); // 常驻：内部按开关启停，保证设置里打开能即时生效
  startNightMode(s); // 常驻：快捷键可反向打开

  // 四个按钮任一开启都要启动工具模块。
  // 旧条件只判断 coverDownload / danmakuExport，导致只开「下载视频」或「下载字幕」时
  // 按钮完全不注入——这是本模块此前最直接的失效点。
  if (s.coverDownload || s.videoDownload || s.subtitleDownload || s.danmakuExport) {
    startDownloadTools(s);
  }
}

export type { BiliSettings };
