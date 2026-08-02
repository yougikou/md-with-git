import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const [repositoryArgument, scopeArgument = 'docs', portArgument = '4180'] = process.argv.slice(2);

if (!repositoryArgument) {
  throw new Error('用法：node tests/local-git-browser-server.mjs <git-仓库根目录> [文档目录] [端口]');
}

const repositoryRoot = resolve(repositoryArgument);
const scope = scopeArgument.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
const port = Number(portArgument);

function safeRelativePath(value) {
  const normalized = value.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((part) => part === '..')) return null;
  return normalized;
}

function allowPath(path) {
  return path === '.git' || path.startsWith('.git/') || path === scope || path.startsWith(`${scope}/`);
}

function resolveInsideRepository(path) {
  const target = resolve(repositoryRoot, ...path.split('/'));
  const insideRepository = target === repositoryRoot || target.startsWith(`${repositoryRoot}${sep}`);
  return insideRepository ? target : null;
}

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await collectFiles(resolve(directory, entry.name), path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function send(response, status, headers, body) {
  response.writeHead(status, { 'access-control-allow-origin': '*', ...headers });
  response.end(body);
}

createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/index') {
      const gitFiles = await collectFiles(resolve(repositoryRoot, '.git'), '.git');
      const documentFiles = await collectFiles(resolve(repositoryRoot, scope), scope);
      send(response, 200, { 'content-type': 'application/json' }, JSON.stringify([...gitFiles, ...documentFiles]));
      return;
    }
    if (url.pathname === '/file') {
      const path = safeRelativePath(url.searchParams.get('path') || '');
      if (!path || !allowPath(path)) {
        send(response, 400, { 'content-type': 'text/plain; charset=utf-8' }, '拒绝访问该路径');
        return;
      }
      const target = resolveInsideRepository(path);
      if (!target || !(await stat(target)).isFile()) {
        send(response, 404, { 'content-type': 'text/plain; charset=utf-8' }, '文件不存在');
        return;
      }
      send(response, 200, { 'content-type': 'application/octet-stream' }, await readFile(target));
      return;
    }
    send(response, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'Not found');
  } catch (error) {
    send(response, 500, { 'content-type': 'application/json' }, JSON.stringify({ message: error instanceof Error ? error.message : String(error) }));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`本地 Git 浏览器测试服务：http://127.0.0.1:${port}（只读 ${relative(process.cwd(), repositoryRoot) || repositoryRoot}）`);
});
