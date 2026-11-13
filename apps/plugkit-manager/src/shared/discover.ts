// 插件发现：popup 与 options 共用同一套识别逻辑。
// 此前两处各抄一遍过滤条件，任何一处改动都会造成两页表现不一致。
import { browser } from 'wxt/browser';

/** 系列标识：manifest 自定义字段读不到时，用名称前缀兜底 */
export const SUITE_NAME_PREFIX = 'PlugKit';

export interface ManagedPlugin {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  iconUrl?: string;
  optionsUrl?: string;
  displayName: string;
  category: string;
  description?: string;
  homepageUrl?: string;
  isSelf: boolean;
  /** 识别依据：manifest 自定义字段 / 名称前缀 */
  matchedBy: 'manifest' | 'name';
}

/**
 * 枚举本机扩展并挑出 PlugKit 系列。
 * 识别走两条通道：manifest 的 plugkit 字段（约定见 docs/CONTRACT.md），
 * 以及名称前缀兜底——Chrome 的 management API 在部分版本会剥离未知 manifest 字段。
 */
export async function discoverPlugins(selfId: string): Promise<ManagedPlugin[]> {
  const all = (await browser.management.getAll()) as any[];
  return all
    .map((e): ManagedPlugin | null => {
      const meta = e.manifest?.plugkit;
      const byManifest = meta?.suite === 'plugkit';
      const byName = typeof e.name === 'string' && e.name.startsWith(SUITE_NAME_PREFIX);
      if (!byManifest && !byName) return null;
      return {
        id: e.id,
        name: e.name,
        version: e.version,
        enabled: !!e.enabled,
        iconUrl: e.icons?.[e.icons.length - 1]?.url,
        optionsUrl: e.optionsUrl,
        displayName: meta?.displayName ?? e.name,
        category: meta?.category ?? 'PlugKit',
        description: e.description,
        homepageUrl: e.homepageUrl,
        isSelf: e.id === selfId,
        matchedBy: byManifest ? 'manifest' : 'name',
      };
    })
    .filter((p): p is ManagedPlugin => p !== null)
    .sort((a, b) => {
      // 本平台置顶，其余按显示名
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });
}

export interface BulkResult {
  ok: number;
  failed: { name: string; err: string }[];
}

/**
 * 批量启用/禁用。
 * 跳过自身：禁用管理平台会让 popup 立即消失，用户没有恢复入口。
 * 逐个执行而非并发——management.setEnabled 在部分平台不支持并发。
 */
export async function setEnabledBulk(
  plugins: ManagedPlugin[],
  enabled: boolean,
): Promise<BulkResult> {
  const targets = plugins.filter((p) => !p.isSelf && p.enabled !== enabled);
  const failed: BulkResult['failed'] = [];
  let ok = 0;
  for (const p of targets) {
    try {
      await browser.management.setEnabled(p.id, enabled);
      ok += 1;
    } catch (e) {
      failed.push({ name: p.displayName, err: String(e) });
    }
  }
  return { ok, failed };
}
