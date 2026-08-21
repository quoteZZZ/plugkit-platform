#!/usr/bin/env node
// 把各插件的构建产物（.output/chrome-mv3）同步到仓库外的构建产物目录（默认 ../<插件名>），
// 并自动 git 提交，保持「源码仓库 / 可加载扩展目录」不漂移。
// 用法: pnpm sync-dist [--app <bilibili|manager>]
//  - 默认同步所有存在 .output/chrome-mv3 的 app
//  - 目标目录与 app 同名（如 plugkit-bilibili），须为已初始化的 git 仓库（保留其 .git）
import { readdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const appsDir = join(root, 'apps');
// 构建产物仓库根目录：默认 monorepo 上一级（当前场景即桌面「插件」目录）
const destRoot = process.env.PLUGKIT_DIST_ROOT ?? join(root, '..');

const appFilter = process.argv.includes('--app') ? process.argv[process.argv.indexOf('--app') + 1] : null;

const appNames = (await readdir(appsDir)).filter(
  (n) => !n.startsWith('.') && existsSync(join(appsDir, n, 'package.json')),
);

let synced = 0;
for (const appName of appNames) {
  if (appFilter && appName !== `plugkit-${appFilter}`) continue;

  const outputDir = join(appsDir, appName, '.output', 'chrome-mv3');
  if (!existsSync(outputDir)) {
    if (appFilter) console.warn(`⚠️ ${appName} 无 .output/chrome-mv3，先构建`);
    continue;
  }

  const dest = join(destRoot, appName);
  if (!existsSync(dest)) {
    console.warn(`⚠️ 目标目录不存在（跳过）: ${dest}`);
    continue;
  }

  // 清空目标（保留 .git），再整体复制，避免残留旧文件
  for (const entry of await readdir(dest)) {
    if (entry === '.git') continue;
    await rm(join(dest, entry), { recursive: true, force: true });
  }
  await cp(outputDir, dest, { recursive: true });

  // 自动提交（无改动时忽略 nothing to commit 错误）
  if (existsSync(join(dest, '.git'))) {
    try {
      execSync('git add -A && git commit -m "构建产物同步 ' + new Date().toISOString().slice(0, 10) + '"', {
        cwd: dest,
        stdio: 'inherit',
      });
    } catch {
      /* 无变更或提交失败，不阻塞 */
    }
  }
  console.log(`✅ ${appName} → ${dest}`);
  synced += 1;
}

if (synced === 0) console.log('没有可同步的构建产物（先执行 pnpm -r build）');
