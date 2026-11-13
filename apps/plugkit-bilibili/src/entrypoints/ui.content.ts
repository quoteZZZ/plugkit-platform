// Content Script B：document_idle 注入，加载页面功能模块（净化/增强/弹幕/工具）
// 与 content.ts(document_start) 分离，避免拖慢早期 hook；保持各自体积小
import { defineContentScript } from 'wxt/utils/define-content-script';
import { loadFeatures } from '../features';
import { listenMeta } from '../shared/meta';

export default defineContentScript({
  matches: ['*://*.bilibili.com/*'],
  runAt: 'document_idle',
  main() {
    // 先建立视频元信息桥接收听，再加载功能——
    // 下载 / UP 属地 / 精确统计都依赖它，晚一步就会首屏拿不到数据
    listenMeta();
    void loadFeatures();
  },
});
