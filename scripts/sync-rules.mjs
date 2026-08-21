#!/usr/bin/env node
// 从 pcdn-patterns.json（单一真源）重新生成 DNR 规则文件，并校验一致性。
// 用法: pnpm sync-rules
//  - 生成 apps/plugkit-bilibili/public/rules_base.json 与 rules_aggressive.json
//  - 校验 wxt.config.ts 的 host_permissions 是否覆盖全部拦截域名（只读检查，不自动改）
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const appDir = join(root, 'apps', 'plugkit-bilibili');
const patternsPath = join(appDir, 'src', 'shared', 'pcdn-patterns.json');
const rulesBasePath = join(appDir, 'public', 'rules_base.json');
const rulesAggressivePath = join(appDir, 'public', 'rules_aggressive.json');
const wxtConfigPath = join(appDir, 'wxt.config.ts');

const RESOURCE_TYPES = ['xmlhttprequest', 'media', 'websocket', 'other', 'ping'];

const patterns = JSON.parse(await readFile(patternsPath, 'utf8'));
if (!Array.isArray(patterns.base) || !Array.isArray(patterns.aggressive)) {
  console.error('pcdn-patterns.json 结构非法：需要 { base: string[], aggressive: string[] }');
  process.exit(1);
}

/** 生成一条 DNR block 规则 */
function buildRules(domains, startId) {
  return domains.map((d, i) => ({
    id: startId + i,
    priority: 1,
    action: { type: 'block' },
    condition: { urlFilter: `||${d}`, resourceTypes: RESOURCE_TYPES },
  }));
}

const baseRules = buildRules(patterns.base, 1);
const aggressiveRules = buildRules(patterns.aggressive, 101);

await writeFile(rulesBasePath, JSON.stringify(baseRules, null, 2) + '\n');
await writeFile(rulesAggressivePath, JSON.stringify(aggressiveRules, null, 2) + '\n');
console.log(`✅ 已生成 ${rulesBasePath}（${baseRules.length} 条）`);
console.log(`✅ 已生成 ${rulesAggressivePath}（${aggressiveRules.length} 条）`);

// —— 一致性校验（host_permissions 必须覆盖全部拦截域名；只读告警，不自动改）——
// 覆盖判断：条目 `*://*.X/*` 对 d 生效，当 d === X 或以 `.X` 结尾（子域通配）。
const allDomains = [...patterns.base, ...patterns.aggressive];
const cfg = await readFile(wxtConfigPath, 'utf8');
const perms = [...cfg.matchAll(/\*:\/\/\*\.([a-zA-Z0-9.-]+)\/\*/g)].map((m) => m[1]);
const missing = allDomains.filter(
  (d) => !perms.some((x) => d === x || d.endsWith(`.${x}`)),
);
if (missing.length > 0) {
  console.warn(`⚠️ 以下域名缺少 host_permissions 覆盖（wxt.config.ts）：\n  ${missing.join('\n  ')}`);
  console.warn('请补上 *://*.<domain>/* 权限，否则 webRequest/DNR 可能无法生效。');
} else {
  console.log('✅ host_permissions 已覆盖全部拦截域名');
}

// —— 校验 WEB_REQUEST_FILTER 已同步（按域名真源生成，理论上恒一致；防御性检查）——
const rulesSrcPath = join(appDir, 'src', 'shared', 'rules.ts');
const rulesSrc = await readFile(rulesSrcPath, 'utf8');
const stale = allDomains.some((d) => rulesSrc.includes(`'${d}'`));
if (!stale) {
  console.log('✅ shared/rules.ts 不包含硬编码域名（已由真源生成）');
}
