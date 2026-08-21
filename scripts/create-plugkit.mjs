#!/usr/bin/env node
// 一键生成新插件：复制 plugkit-starter，并完整改写插件身份（包名 / 显示名 / 分类 / pluginId）
// 用法: pnpm create-plugkit <plugin-name> [--display-name "显示名"] [--category 分类]
//   例: pnpm create-plugkit douyin --display-name "抖音净化" --category 工具
import { rm, cp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// —— 参数解析 ——
const args = process.argv.slice(2);
const name = args[0];
function opt(key) {
  const i = args.indexOf(key);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
}
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('用法: pnpm create-plugkit <plugin-name> [--display-name "显示名"] [--category 分类]');
  console.error('  plugin-name 须为小写字母开头，仅含小写字母/数字/连字符');
  process.exit(1);
}
const displayName = opt('--display-name') ?? name;
const category = opt('--category') ?? '工具';

const target = join(root, 'apps', `plugkit-${name}`);
if (existsSync(target)) {
  console.error('已存在: apps/plugkit-' + name);
  process.exit(1);
}

// —— 复制模板（过滤排除 node_modules/.output/.wxt/dist，避免 pnpm 软链复制失败）——
const EXCLUDE_DIRS = new Set(['node_modules', '.output', '.wxt', 'dist']);
await cp(join(root, 'apps', 'plugkit-starter'), target, {
  recursive: true,
  filter: (src) => {
    const name = src.split(/[\\/]/).pop() ?? '';
    return !EXCLUDE_DIRS.has(name);
  },
});

// —— 改写 package.json：包名 + 保持 private（monorepo 应用不发布）——
const pkgPath = join(target, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
pkg.name = `@plugkit/plugin-${name}`;
pkg.version = '0.1.0';
pkg.private = true;
await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

// —— 改写 wxt.config.ts：显示名 / 描述 / plugkit 身份 ——
const cfgPath = join(target, 'wxt.config.ts');
let cfg = await readFile(cfgPath, 'utf8');
cfg = cfg.replace(/name:\s*'[^']*'/, `name: 'PlugKit ${displayName}'`);
cfg = cfg.replace(
  /description:\s*'[^']*'/,
  `description: 'PlugKit 系列插件：${displayName}（由 create-plugkit 生成）'`,
);
cfg = cfg.replace(/pluginId:\s*'[^']*'/, `pluginId: '${name}'`);
cfg = cfg.replace(/displayName:\s*'[^']*'/, `displayName: '${displayName}'`);
cfg = cfg.replace(/category:\s*'[^']*'/, `category: '${category}'`);
await writeFile(cfgPath, cfg);

// —— 改写 background 跨插件桥的 pluginId（保证 manager 日志归属正确）——
const bgPath = join(target, 'src', 'entrypoints', 'background.ts');
const bg = await readFile(bgPath, 'utf8');
await writeFile(bgPath, bg.replace(/pluginId:\s*'[^']*'/, `pluginId: '${name}'`));

console.log(`✅ 已创建 apps/plugkit-${name}`);
console.log(`   displayName: ${displayName} · category: ${category} · pluginId: ${name}`);
console.log(`下一步:\n  pnpm install\n  pnpm -F @plugkit/plugin-${name} dev   # 开发\n  pnpm -F @plugkit/plugin-${name} build # 构建`);
