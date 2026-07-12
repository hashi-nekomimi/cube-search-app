# Repository Guidelines

## Project Structure & Module Organization

このリポジトリは React 19 + Vite のアプリケーションです。ソースコードは `src/` にあり、エントリポイントは `src/main.jsx`、主要なキューブ検索 UI とロジックは `src/App.jsx` にまとまっています。コンポーネント向けのスタイルは主に `src/App.css`、グローバル CSS は `src/index.css` です。ブラウザへそのまま配信する静的ファイルは `public/`、コードから import する画像や SVG は `src/assets/` に置きます。`dist/` はビルド成果物なので手で編集しないでください。

## Build, Test, and Development Commands

- `npm install`: `package-lock.json` に基づいて依存関係をインストールします。
- `npm run dev`: Vite の開発サーバーを起動し、ホットリロード付きで動作確認します。
- `npm run build`: 本番用バンドルを `dist/` に生成します。
- `npm run preview`: ビルド済みアプリをローカルで配信し、本番に近い状態で確認します。
- `npm run lint`: JavaScript / JSX ファイルに ESLint を実行します。

## Coding Style & Naming Conventions

モダンな JavaScript modules と React function components を使います。コンポーネント名は `PascalCase`、hooks やヘルパー関数は `camelCase`、固定の対応表や定数は `UPPER_SNAKE_CASE` を基本にします。設定ファイルでは 2 スペースインデント、`src/App.jsx` ではセミコロン付きの書き方が使われているため、編集対象ファイルの既存スタイルに合わせてください。キューブ変換やパース処理は小さな純粋関数に分け、UI 状態は所有する React コンポーネントの近くに置きます。

## Testing Guidelines

現時点ではテストランナーは設定されていません。変更前後の確認として、少なくとも `npm run lint` と `npm run build` を実行してください。テストを追加する場合は `src/App.test.jsx` または `src/__tests__/` のような配置を推奨します。パーサー、キューブ変換、ユーザーから見える検索フローを優先して検証し、同じ変更で `package.json` にテストコマンドを追加してください。

## Commit & Pull Request Guidelines

直近の履歴では `Update App.jsx` のような短い命令形メッセージが使われています。今後は簡潔さを保ちつつ、例として `Fix cube move parser` のように変更内容が分かる件名にしてください。Pull Request には概要、確認手順（`npm run lint`、`npm run build`）、関連 issue、UI 変更がある場合はスクリーンショットまたは画面録画を含めます。

## Security & Configuration Tips

生成物、ローカル環境ファイル、依存関係フォルダーはコミットしないでください。`node_modules/` と `dist/` はいつでも再生成できる前提で扱います。将来設定値を追加する場合は、必要な環境変数を README に記載し、ローカル開発向けの安全な既定値を用意してください。
