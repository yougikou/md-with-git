import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');

const requiredFiles = [
  'tests/fixtures/docs/README.md',
  'tests/fixtures/docs/guide/install.md',
  'tests/fixtures/docs/guide/advanced/plugins.md',
  'tests/fixtures/docs/api/button.md',
  'tests/fixtures/docs/examples/markdown.md',
  'tests/fixtures/docs/examples/assets.md',
  'tests/fixtures/docs/examples/change-history.md',
  'tests/fixtures/docs/examples/plugins.md',
  'tests/fixtures/docs/assets/fixture.svg',
  'tests/fixtures/docs/_ignored.md',
  'tests/fixtures/local-documents/README.md',
  'tests/fixtures/local-documents/guides/getting-started.md',
  'tests/fixtures/local-documents/examples/renderers.md',
  'tests/fixtures/local-documents/assets/local-flow.svg',
];

const contentRequirements = [
  ['tests/fixtures/docs/README.md', 'title: Viewer 测试夹具首页'],
  ['tests/fixtures/docs/api/button.md', '| 属性 | 类型 | 默认值 |'],
  ['tests/fixtures/docs/examples/assets.md', '![Relative asset fixture](../assets/fixture.svg)'],
  ['tests/fixtures/docs/examples/change-history.md', '```yaml renderer=change-history'],
  ['tests/fixtures/docs/examples/change-history.md', '```yaml renderer=not-installed'],
  ['tests/fixtures/docs/examples/plugins.md', '```mermaid'],
  ['tests/fixtures/docs/examples/plugins.md', 'layout: elk'],
  ['tests/fixtures/docs/examples/plugins.md', 'nodePlacementStrategy: BRANDES_KOEPF'],
  ['tests/fixtures/docs/examples/plugins.md', '$E = mc^2$'],
  ['tests/fixtures/docs/examples/plugins.md', '```demo title="计数器 Demo"'],
  ['tests/fixtures/local-documents/README.md', './guides/getting-started.md'],
  ['tests/fixtures/local-documents/guides/getting-started.md', '![本地流程图](../assets/local-flow.svg)'],
  ['tests/fixtures/local-documents/guides/getting-started.md', 'layout: elk'],
  ['tests/fixtures/local-documents/examples/renderers.md', '```mermaid'],
  ['tests/fixtures/local-documents/examples/renderers.md', 'layout: elk'],
  ['tests/fixtures/local-documents/examples/renderers.md', '$a^2 + b^2 = c^2$'],  ['tests/fixtures/local-documents/examples/renderers.md', '```demo title="本地计数器"'],
];

for (const file of requiredFiles) {
  await access(resolve(repositoryRoot, file));
}

for (const [file, expectedText] of contentRequirements) {
  const contents = await readFile(resolve(repositoryRoot, file), 'utf8');
  if (!contents.includes(expectedText)) {
    throw new Error(`测试夹具缺少预期内容：${file} -> ${expectedText}`);
  }
}

process.stdout.write(`Fixture contract passed (${requiredFiles.length} files, ${contentRequirements.length} assertions).\n`);
