# Git MD Viewer

[English](./README.en.md) · 日本語 · [简体中文](./README.md)

Git MD Viewer は、プロダクトチーム向けの React 製ドキュメントビューアです。Git リポジトリ内の**指定ディレクトリ**にある Markdown を、閲覧・検索・履歴確認ができるドキュメントスペースとして提供します。コンテンツと履歴の唯一の正とするのはリポジトリであり、Viewer はその読み込み、構成、描画だけを担います。

既存の Web プロダクトに製品ドキュメント、技術ハンドブック、リリースノート、チームナレッジを組み込む用途や、単体 PWA としての利用に適しています。

> **リリース状況**：`@md-with-git/viewer@0.1.5` は安定した `DocsViewer` エントリ、軽量なホスト API、スタイルシート入口を提供します。React、React DOM、React Router はホストが提供する peer dependency です。

> **ホスト例**：[md-with-git-branded](https://github.com/yougikou/md-with-git-branded) · [ライブデモ](https://yougikou.github.io/md-with-git-branded/)

## 主な機能

| 領域 | 機能 |
| --- | --- |
| ドキュメントスペース | `scope` で Git 内のドキュメントルートを限定し、リポジトリ全体をドキュメントサイトとして扱いません。 |
| 閲覧 | Markdown を検出し、README / index のトップページを識別し、frontmatter・最初の H1・ファイル名からナビゲーションを生成します。 |
| Markdown | GFM、タスクリスト、表、frontmatter、相対アセット、Mermaid、KaTeX をサポートします。 |
| データソース | GitHub、Bitbucket Cloud、ローカルフォルダ、ローカル Git リポジトリに対応します。 |
| バージョン情報 | Provider 契約はブランチ/タグ、ファイル履歴、比較を扱います。 |
| 検索 | 利用端末のリソースに応じて、現在のドキュメントスペースの全文インデックスを作成します。 |
| ホスト拡張 | ホストが fenced-code と YAML レンダラーを明示的に登録します。ドキュメントからコンポーネントを読み込み・実行することはできません。 |
| オフライン | HTTPS または localhost では PWA としてインストールできます。Service Worker はアプリシェルだけをキャッシュし、リモートリポジトリの応答は保存しません。 |

## ドキュメントスペースのモデル

1 回の表示対象はリポジトリ全体ではなく、1 つのドキュメントスペースです。

```text
/docs/vitejs/vite/docs/guide?scope=docs%2Fguide
/docs/vitejs/vite/docs/guide/features.md?scope=docs%2Fguide&ref=main
```

`scope` はドキュメントルートです。ナビゲーション、トップページ選択、検索、相対リンク解決はすべてこの範囲に限定されます。`ref` にはブランチまたはタグを指定できます。これにより、1 つのリポジトリ内に独立した複数のドキュメントスペースを置けます。

```text
Git repository
├── docs/guide/          ← scope
│   ├── README.md        ← トップページ
│   ├── install.md
│   └── advanced/
└── application source   ← Viewer のツリーには表示されない
```

## クイックスタート：内蔵 Viewer を実行する

必要条件：Node.js 22.14 以上、および Corepack またはグローバルインストールで提供される pnpm 11。

```bash
corepack enable
pnpm install
pnpm dev
```

ホーム画面から GitHub / Bitbucket のドキュメントスペースを追加するか、ローカルフォルダまたはローカル Git リポジトリを選択します。本番用の静的ファイルは次で作成します。

```bash
pnpm run build
```

デプロイ時は `/` と `/docs/*` に SPA フォールバックを設定し、`sw.js` を HTTPS で配信してください。

## ホストアプリケーションとして二次開発する

ホストはルーティング、認証、テーマ、エラーバウンダリ、ソース選択、拡張登録を担当します。Git ドキュメントはコンテンツとデータのみを提供し、実行する React コンポーネントを**選択できません**。

```text
Host application
├── product routes / auth / theme / error boundary
├── document-source setup
├── renderer registry             ← 明示的に許可した拡張
└── Viewer route
    ├── provider reads Git/local content
    ├── markdown parser
    └── registered renderer only  ← dynamic import / eval は使用しない
```

[standalone-host の例](./examples/standalone-host/) は目標とする統合形態を示します。公開パッケージのエントリが提供された後の初期化は、次のようになります。

```tsx
import {
  DocsRendererProvider,
  createDocsRendererRegistry,
} from '@md-with-git/viewer';
import { ChangeHistoryRenderer } from './docs-renderers';

const registry = createDocsRendererRegistry();
registry.registerYamlRenderer('change-history', ChangeHistoryRenderer);

export function App() {
  return (
    <DocsRendererProvider registry={registry}>
      {/* ここでプロダクトのルートと Viewer ルートをマウントします。 */}
    </DocsRendererProvider>
  );
}
```

現時点では、内蔵ホストの `src/main.tsx` を起点にするか、monorepo で `src/features/docs/` を直接再利用してください。公開エントリが用意される前に、上記のパッケージ import を本番ビルドで使用しないでください。

### 信頼境界を広げずに Markdown を拡張する

レンダラー登録表は Markdown の宣言を、ホストアプリケーションにコンパイル済みの React コンポーネントへ対応付けます。次をサポートします。

- ホストが登録した名前で選択する YAML fenced block
- ホストが登録した言語で選択する fenced-code block
- ルート、テナント、フィーチャーフラグ単位の拡張管理に使える登録解除関数

```ts
interface YamlBlockRendererProps {
  value: unknown;
  context: {
    documentPath: string;
    repository: string;
    ref?: string;
    scope?: string;
  };
}

registry.registerYamlRenderer('change-history', ChangeHistoryRenderer);
registry.registerCodeBlockRenderer('demo', DemoRenderer);
```

ドキュメントには `change-history` YAML ブロックを記述できます。これはデータと名前に過ぎず、ホストがその名前を登録している場合だけコンポーネントとして描画されます。未知の名前は診断付きの通常のコードブロックにフォールバックします。

````markdown
```yaml renderer=change-history
entries:
  - version: 1.2.0
    date: 2026-08-08
    summary: Local Git support
```
````

YAML は信頼できない入力として扱い、描画前に構造を検証してください。`eval`、Markdown からのモジュールパス推測、リモート JavaScript の読み込みは行わないでください。

### Repository Provider を追加する

データソースは `RepositoryProvider` を実装します。新しい Provider はファイルツリー、ファイル内容、アセット URL、ref、ファイル履歴、比較を提供し、その後ホストの明示的なソース設定に接続します。

```ts
interface RepositoryProvider {
  getTree(input: TreeQuery): Promise<RepositoryEntry[]>;
  getFile(input: FileQuery): Promise<string>;
  getAssetUrl(input: AssetQuery): string | Promise<string>;
  getRefs(input: TreeQuery): Promise<RepositoryRef[]>;
  getFileHistory(input: HistoryQuery): Promise<Commit[]>;
  compare(input: CompareQuery): Promise<DiffResult>;
}
```

[GitHubProvider](./src/features/docs/providers/GitHubProvider.ts)、[BitbucketProvider](./src/features/docs/providers/BitbucketProvider.ts)、ローカル Provider を参考にしてください。Provider はユーザーが認可したコンテンツだけを読み取り、トークン、キャッシュ、エラー処理を UI から分離すべきです。

## プライベートリポジトリとセキュリティ

このプロジェクトは OAuth を実装せず、バックエンドも必要としません。ユーザーは Viewer に自身のアクセストークンを貼り付けられます。トークンは `Authorization: Bearer <token>` として送信され、ブラウザの `sessionStorage` にのみ保存されます。platform + owner/workspace + repository ごとに分離され、URL、ワークスペース設定、Service Worker キャッシュには書き込まれません。

- GitHub：対象リポジトリに限定した Fine-grained PAT を優先し、**Contents: Read-only** だけを付与します。履歴が必要な場合は **Metadata** の読み取りも残します。
- Bitbucket Cloud：リポジトリごとに **Repositories: Read** のみを持つ Repository access token を推奨します。
- トークンは依然としてブラウザ側の秘密情報です。信頼できる端末とサイトでのみ使い、ソース、`.env`、スクリーンショットに残さないでください。

## プロジェクト構成

```text
src/
├── main.tsx                    # 内蔵ホストアプリケーションとルート
├── features/docs/
│   ├── DocsPage.tsx             # ドキュメントスペースのルートと UI
│   ├── providers/               # GitHub、Bitbucket、local Provider
│   ├── renderers/               # 安全なホスト拡張の登録表
│   ├── search.ts                # 現在の scope の全文検索
│   └── workspaceSources.ts      # 保存済みドキュメントスペース
examples/standalone-host/        # 目標のホスト統合例
tests/fixtures/docs/             # 手動テスト可能な公開フィクスチャ
```

## 検証と公開

公開される tarball を確認します。

```bash
pnpm pack --dry-run
```

`package.json` と一致するタグ（例：`v0.1.0`）を push すると、[npm 公開ワークフロー](./.github/workflows/publish-npm.yml) が実行されます。npm Trusted Publishing（OIDC）を使用するため、長期的な `NPM_TOKEN` を GitHub に保存する必要はありません。最初の npm リリースは手動で作成し、その後 npm のパッケージ設定で `yougikou/md-with-git` と `publish-npm.yml` を Trusted Publisher として設定してください。

npm のバージョンは上書きできません。公開前にパッケージの export が準備できていることを確認してください。現在のリリースの中心は Viewer アプリケーションとホスト拡張の基盤であり、まだ安定したライブラリエントリではありません。

## 参照

- [プロダクト・アーキテクチャの設計図](./BLUEPRINT.md)
- [standalone host の例](./examples/standalone-host/)
- [手動テストガイド](./tests/README.md)
