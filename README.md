# React Flow Test

このディレクトリは、構造をグラフとして眺めて編集しつつ、JSON を本体データとして持ち出せる最小実験場です。

## 目的

- React Flow を編集 UI として使う
- 本体は可搬な `graph JSON` にする
- ほかのツールに移すときは JSON を変換する

## ファイル

- `graphs/sample.graph.json`
  - 持ち出し前提のサンプルデータ
- `graphs/portable-graph.schema.json`
  - JSON Schema
- `src/lib/portableGraph.js`
  - React Flow と portable graph の相互変換

## 使い方

```bash
npm install
npm run dev
```

ブラウザで JSON を直接貼り替えるか、`Download JSON` で保存して、別ツール側の変換に回せます。

## 移行の考え方

- React Flow
  - そのまま編集 UI に使う
- TouchDesigner
  - `nodes` と `edges` を DAT/JSON 経由で読む
- Mermaid / Cytoscape / NetworkX
  - `from`, `to`, `label`, `meta` を別形式へ写す

React Flow 固有の `data.label`, `source`, `target` は本体 JSON に残していないので、移行時の癖が少なくなります。

## Git

このディレクトリだけで `git init` しておくと、JSON の差分追跡とスキーマ変更の管理がしやすくなります。
