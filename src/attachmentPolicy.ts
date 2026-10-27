/**
 * 浏览器侧附件预检默认值；服务端运行配置仍是最终校验事实源。
 * 这里只拦截默认契约下明显无效的选择，避免提交后才发现可修复的输入错误。
 */
export const DEFAULT_ATTACHMENT_POLICY = {
  maxCount: 3,
  maxSizeBytes: 5 * 1024 * 1024,
  maxTotalSizeBytes: 10 * 1024 * 1024,
  allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'] as readonly string[],
  filenameMaxLength: 255
} as const;

export type AttachmentPolicy = {
  maxCount: number;
  maxSizeBytes: number;
  maxTotalSizeBytes: number;
  allowedContentTypes: readonly string[];
  filenameMaxLength: number;
};

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

/** 返回可直接展示给用户的错误消息；合法选择返回 null。 */
export function validateAttachmentFiles(
  files: readonly File[],
  policy: AttachmentPolicy = DEFAULT_ATTACHMENT_POLICY
): string | null {
  if (files.length > policy.maxCount) {
    return `附件最多选择 ${policy.maxCount} 个`;
  }

  let totalSize = 0;
  for (const file of files) {
    if (file.name.length > policy.filenameMaxLength) {
      return `文件名不能超过 ${policy.filenameMaxLength} 个字符：${file.name}`;
    }
    if (file.size > policy.maxSizeBytes) {
      return `单个附件不能超过 ${megabytes(policy.maxSizeBytes)}：${file.name}`;
    }
    if (!policy.allowedContentTypes.some(contentType => contentType.toLowerCase() === file.type.toLowerCase())) {
      return `不支持的附件类型：${file.name}`;
    }
    totalSize += file.size;
  }
  if (totalSize > policy.maxTotalSizeBytes) {
    return `附件总大小不能超过 ${megabytes(policy.maxTotalSizeBytes)}`;
  }
  return null;
}
