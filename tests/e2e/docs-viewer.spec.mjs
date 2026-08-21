import { expect, test } from '@playwright/test';
import { readdir, readFile, rm } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { createLocalGitFixture } from '../create-local-git-fixture.mjs';

let fixtureRoot = '';
let directoryFiles = [];

async function collectFixtureFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFixtureFiles(fullPath, root));
    else if (entry.isFile()) files.push({ path: relative(root, fullPath).replaceAll('\\', '/'), bytes: (await readFile(fullPath)).toString('base64') });
  }
  return files;
}

test.beforeAll(async () => {
  fixtureRoot = await createLocalGitFixture();
  directoryFiles = await collectFixtureFiles(fixtureRoot);
});

test.afterAll(async () => {
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((files) => {
    const root = { kind: 'directory', name: 'local-git-fixture', children: new Map() };
    for (const file of files) {
      const parts = file.path.split('/');
      let directory = root;
      for (const part of parts.slice(0, -1)) {
        if (!directory.children.has(part)) directory.children.set(part, { kind: 'directory', name: part, children: new Map() });
        directory = directory.children.get(part);
      }
      directory.children.set(parts.at(-1), { kind: 'file', name: parts.at(-1), bytes: file.bytes });
    }
    const toHandle = (node) => node.kind === 'file'
      ? { kind: 'file', name: node.name, getFile: async () => {
        const binary = atob(node.bytes);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        return new File([bytes], node.name);
      } }
      : { kind: 'directory', name: node.name, async *values() { for (const child of node.children.values()) yield toHandle(child); } };
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => toHandle(root) });
  }, directoryFiles);
});

test('本地 Git 文档空间支持搜索、移动目录、History 与 Diff', async ({ page }) => {
  await page.goto('/?mode=local-git');
  await page.getByRole('button', { name: '选择包含 .git 的项目文件夹' }).click();
  await page.locator('.scope-tree-option').filter({ hasText: 'docs' }).click();
  await page.locator('.local-git-form-card button[type="submit"][value="open"]').click();
  await expect(page).toHaveURL(/\/docs\/local\/git/);

  const search = page.getByRole('combobox', { name: '搜索全部文档' });
  await expect(search).toHaveAttribute('placeholder', '搜索全部文档', { timeout: 30_000 });
  await search.fill('Git history check');
  const result = page.getByRole('option').filter({ hasText: 'Getting Started' });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByRole('heading', { name: '本地文档开始使用' })).toBeVisible();
  await expect(page.locator('.mermaid-diagram svg[aria-roledescription="flowchart-elk"]')).toBeVisible({ timeout: 30_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.locator('.mobile-menu');
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.locator('.docs-layout')).toHaveClass(/sidebar-visible/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.docs-layout')).not.toHaveClass(/sidebar-visible/);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('link', { name: '历史记录' }).click();
  await expect(page.getByText('docs: add history fixture')).toBeVisible();
  const compareLinks = page.getByRole('link', { name: '与当前版本比较' });
  await expect(compareLinks).toHaveCount(2);
  const diffHref = await compareLinks.nth(1).getAttribute('href');
  expect(diffHref).toBeTruthy();
  const diffUrl = new URL(diffHref, page.url());
  expect(diffUrl.pathname).toContain('/diff');
  expect(diffUrl.searchParams.get('from')).toBeTruthy();
  expect(diffUrl.searchParams.get('to')).toBeTruthy();
});

test('第一阶段的目录、目录折叠、表格与 Mermaid 交互可访问', async ({ page }) => {
  await page.goto('/?mode=local-git');
  await page.getByRole('button', { name: '选择包含 .git 的项目文件夹' }).click();
  await page.locator('.scope-tree-option').filter({ hasText: 'docs' }).click();
  await page.locator('.local-git-form-card button[type="submit"][value="open"]').click();
  await expect(page).toHaveURL(/\/docs\/local\/git/);
  const search = page.getByRole('combobox', { name: '搜索全部文档' });
  await search.fill('Git history check');
  await page.getByRole('option').filter({ hasText: 'Getting Started' }).click();
  await expect(page.getByRole('heading', { name: '本地文档开始使用' })).toBeVisible();

  const toc = page.locator('.document-table-of-contents');
  await expect(toc).toBeVisible();
  await expect(toc.getByRole('link', { name: 'ELK 布局测试' })).toBeVisible();
  const tocToggle = toc.getByRole('button', { name: '收起本页目录' });
  await tocToggle.click();
  await expect(toc).toHaveClass(/collapsed/);
  await expect(toc.getByRole('button', { name: '展开本页目录' })).toHaveAttribute('aria-expanded', 'false');
  await toc.getByRole('button', { name: '展开本页目录' }).click();
  await expect(toc).not.toHaveClass(/collapsed/);

  const sidebar = page.locator('#document-sidebar');
  await page.getByRole('button', { name: '收起文档目录' }).click();
  await expect(sidebar).toHaveClass(/collapsed/);
  await expect(page.locator('.document-wrap')).toHaveClass(/sidebar-collapsed/);
  await page.getByRole('button', { name: '展开文档目录' }).click();
  await expect(sidebar).not.toHaveClass(/collapsed/);

  const firstResizeHandle = page.getByRole('button', { name: '调整第 1 列宽度' });
  await expect(firstResizeHandle).toBeVisible();
  const header = page.locator('.markdown-resizable-table th').first();
  const originalWidth = await header.evaluate((element) => element.getBoundingClientRect().width);
  await firstResizeHandle.press('ArrowRight');
  await expect.poll(() => header.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(originalWidth);
  await firstResizeHandle.press('Enter');

  const expandDiagram = page.getByRole('button', { name: '放大 Mermaid 图表' });
  await expect(expandDiagram).toBeVisible({ timeout: 30_000 });
  await expandDiagram.click();
  await expect(page.getByRole('dialog', { name: 'Mermaid 图表放大视图' })).toBeVisible();
  await page.locator('.mermaid-modal-close').click();
  await expect(page.getByRole('dialog', { name: 'Mermaid 图表放大视图' })).not.toBeVisible();
});

test('第三阶段工作区来源可重命名、排序和移除', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('git-md-viewer-workspace-sources', JSON.stringify([
      { id: 'source-architecture', label: '架构文档', kind: 'github', owner: 'acme', repository: 'architecture', scope: 'docs' },
      { id: 'source-product', label: '产品文档', kind: 'bitbucket', owner: 'acme', repository: 'product', scope: 'handbook' },
    ]));
  });
  await page.goto('/');

  const architectureRow = page.locator('.workspace-settings-row').filter({ hasText: '架构文档' });
  await architectureRow.getByRole('textbox', { name: '架构文档 的显示名称' }).fill('平台架构');
  await architectureRow.getByRole('button', { name: '保存' }).click();
  const renamedRow = page.locator('.workspace-settings-row').filter({ hasText: '平台架构' });
  await expect(renamedRow).toBeVisible();
  await renamedRow.getByRole('button', { name: '下移' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('git-md-viewer-workspace-sources') || '[]').map((source) => source.label))).toEqual(['产品文档', '平台架构']);
  await page.locator('.workspace-settings-row').filter({ hasText: '平台架构' }).getByRole('button', { name: '移除' }).click();
  await expect(page.locator('.workspace-settings-row')).toHaveCount(1);
});

test('第三阶段 YAML 安全降级与 iframe Demo 仅在显式运行后执行', async ({ page }) => {
  await page.goto('/?mode=local-git');
  await page.getByRole('button', { name: '选择包含 .git 的项目文件夹' }).click();
  await page.locator('.scope-tree-option').filter({ hasText: 'docs' }).click();
  await page.locator('.local-git-form-card button[type="submit"][value="open"]').click();
  await page.getByRole('button', { name: /Renderers/ }).click();
  await expect(page.getByText('未注册 YAML 渲染器 “not-installed”')).toBeVisible();

  const demo = page.locator('.iframe-demo');
  await expect(demo.getByText('尚未运行')).toBeVisible();
  await expect(demo.locator('iframe')).toHaveCount(0);
  await demo.getByRole('button', { name: '运行' }).click();
  const frame = page.frameLocator('iframe[title="本地计数器"]');
  await frame.getByRole('button', { name: '点击次数：0' }).click();
  await expect(frame.getByRole('button', { name: '点击次数：1' })).toBeVisible();
  await demo.getByRole('button', { name: '停止' }).click();
  await expect(demo.locator('iframe')).toHaveCount(0);
});
test('GitHub 文件优先使用 raw 地址，失败时回退 Contents API', async ({ page }) => {
  let rawRequests = 0;
  let apiRequests = 0;
  await page.route('https://raw.githubusercontent.com/acme/docs/main/guide.md', async (route) => {
    rawRequests += 1;
    await route.fulfill({ status: 404, body: 'not found' });
  });
  await page.route('https://api.github.com/repos/acme/docs/contents/guide.md?ref=main', async (route) => {
    apiRequests += 1;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'file', content: btoa('# fallback document'), encoding: 'base64' }) });
  });
  await page.goto('/');
  const fallback = await page.evaluate(async () => {
    const { GitHubProvider } = await import('/src/features/docs/providers/GitHubProvider.ts');
    return new GitHubProvider().getFile({ owner: 'acme', repository: 'docs', path: 'guide.md', ref: 'main' });
  });
  expect(fallback).toBe('# fallback document');
  expect(rawRequests).toBe(1);
  expect(apiRequests).toBe(1);
});
