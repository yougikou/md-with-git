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
