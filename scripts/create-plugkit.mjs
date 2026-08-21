#!/usr/bin/env node
// 一键生成新插件：复制 plugkit-starter，重命名包名 / 插件名
// 用法: pnpm create-plugkit <plugin-name>
import { rm, cp, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const name = process.argv[2];

if (!name) {
  console.error('用法: pnpm create-plugkit <plugin-name>');
  process.exit(1);
}

const target = join(root, 'apps', `plugkit-${name}`);
if (existsSync(target)) {
  console.error('已存在: apps/plugkit-' + name);
  process.exit(1);
}

await cp(join(root, 'apps', 'plugkit-starter'), target, { recursive: true });

// 清理模板可能残留的构建产物
for (const d of ['.output', '.wxt', 'node_modules', 'dist']) {
  await rm(join(target, d), { recursive: true, force: true });
}

// 改写 package.json 的包名
const pkgPath = join(target, 'package.json');
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
pkg.name = `@plugkit/plugin-${name}`;
pkg.version = '0.1.0';
delete pkg.private === false;
await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

// 改写 manifest 显示名
const cfgPath = join(target, 'wxt.config.ts');
let cfg = await readFile(cfgPath, 'utf8');
cfg = cfg.replace(/name:\s*'[^']*'/, `name: 'PlugKit ${name}'`);
await writeFile(cfgPath, cfg);

console.log(`✅ 已创建 apps/plugkit-${name}`);
console.log(`下一步:\n  pnpm install\n  pnpm -F @plugkit/plugin-${name} dev`);
