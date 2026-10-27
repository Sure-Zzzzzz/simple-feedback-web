import { describe, expect, it } from 'vitest';
import { validateAttachmentFiles } from './attachmentPolicy';

function file(name: string, type: string, size = 1): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('附件默认预检策略', () => {
  it('允许默认范围内的图片附件', () => {
    expect(validateAttachmentFiles([
      file('screen.png', 'image/png'),
      file('screen.webp', 'image/webp')
    ])).toBeNull();
  });

  it('拒绝超过数量上限且不静默截断', () => {
    expect(validateAttachmentFiles([
      file('1.png', 'image/png'),
      file('2.png', 'image/png'),
      file('3.png', 'image/png'),
      file('4.png', 'image/png')
    ])).toBe('附件最多选择 3 个');
  });

  it('拒绝单文件大小、总大小、媒体类型和文件名越界', () => {
    expect(validateAttachmentFiles([file('large.png', 'image/png', 5 * 1024 * 1024 + 1)]))
      .toContain('单个附件不能超过 5MB');
    expect(validateAttachmentFiles([
      file('one.png', 'image/png', 4 * 1024 * 1024),
      file('two.png', 'image/png', 4 * 1024 * 1024),
      file('three.png', 'image/png', 4 * 1024 * 1024)
    ])).toBe('附件总大小不能超过 10MB');
    expect(validateAttachmentFiles([file('document.pdf', 'application/pdf')]))
      .toBe('不支持的附件类型：document.pdf');
    expect(validateAttachmentFiles([file(`${'f'.repeat(256)}.png`, 'image/png')]))
      .toContain('文件名不能超过 255 个字符');
  });
});
