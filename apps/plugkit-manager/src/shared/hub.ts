// 跨插件查询/操作封装：管理平台向被管理插件拉取日志、清空日志
import {
  PLUGKIT_CLEAR_LOGS_CHANNEL,
  PLUGKIT_STATUS_CHANNEL,
  sendToExtension,
  clearLogs,
  getLogs,
  type LogEntry,
  type PlugkitStatusReport,
} from '@plugkit/core';

/** 拉取指定插件的状态/日志；超时或对方未实现协议时返回 null（不抛错，保证列表健壮） */
export async function queryPluginStatus(
  extensionId: string,
  timeoutMs = 3000,
): Promise<PlugkitStatusReport | null> {
  try {
    return await Promise.race([
      sendToExtension<undefined, PlugkitStatusReport>(extensionId, PLUGKIT_STATUS_CHANNEL, undefined),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs),
      ),
    ]);
  } catch {
    return null;
  }
}

/** 清空指定插件日志；成功返回 true */
export async function clearPluginLogs(extensionId: string, timeoutMs = 3000): Promise<boolean> {
  try {
    await Promise.race([
      sendToExtension<undefined, unknown>(extensionId, PLUGKIT_CLEAR_LOGS_CHANNEL, undefined),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** 拉取插件日志：自身（manager）走本地 storage，其他插件走跨插件消息。
 *  返回 logs + reachable（插件后台是否可达，用于 UI 明确提示而非空白） */
export async function fetchLogs(
  extensionId: string,
  selfId: string,
): Promise<{ logs: LogEntry[]; reachable: boolean }> {
  if (extensionId === selfId) return { logs: await getLogs(), reachable: true };
  const report = await queryPluginStatus(extensionId);
  return { logs: report?.logs ?? [], reachable: report !== null };
}

/** 清空插件日志：自身走本地 storage，其他插件走跨插件消息 */
export async function clearLogsFor(extensionId: string, selfId: string): Promise<boolean> {
  if (extensionId === selfId) {
    await clearLogs();
    return true;
  }
  return clearPluginLogs(extensionId);
}
