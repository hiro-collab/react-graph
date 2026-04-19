# react-graph

このディレクトリは、構造をグラフとして眺めて編集しつつ、JSON を本体データとして持ち出せる実験場です。

## 目的

- React Flow を編集 UI として使う
- 本体は typed `graph document` にする
- node registry と runtime を分離する
- ほかのツールに移すときは adapter で変換する

## ファイル

- `graphs/portable-graph.schema.json`
  - JSON Schema
- `src/lib/graphDocument.js`
  - 空の graph document を作る
- `src/lib/nodeRegistry.js`
  - ノード定義と executor registry
- `src/lib/portableGraph.js`
  - graph document の正規化と React Flow 変換
- `src/lib/dataflowEngine.js`
  - node registry を使って graph document を評価する実行部

## 使い方

```bash
npm install
npm run dev
```

ブラウザで JSON を直接貼り替えるか、`Download JSON` で保存して、別ツール側の変換に回せます。

`New graph` で空の document から開始し、template ボタンから node を追加します。

## 現在の構成

- graph document
  - `nodes`, `edges`, `ui`, `params`, `meta`
- node registry
  - `type` ごとの family / operator / kind / default params / execute
- runtime
  - registry を見て node を評価
- editor
  - React Flow を canvas として使う

エッジは `from.node`, `from.port`, `to.node`, `to.port` を持つので、node-to-node ではなく port-to-port の表現を取れます。

このブランチでは、ツール本体から特定用途の sample graph や TouchDesigner 再現プリセットを外し、空の document から組み立てる前提にしています。

## 移行の考え方

- React Flow
  - そのまま編集 UI に使う
- TouchDesigner
  - adapter を通して `nodes` と `edges` を DAT/JSON 経由で読む
- Mermaid / Cytoscape / NetworkX
  - `from.port`, `to.port`, `label`, `meta` を別形式へ写す

React Flow 固有の `data.label`, `source`, `target` は本体 JSON に残していないので、移行時の癖が少なくなります。

## Git

このディレクトリだけで `git init` しておくと、JSON の差分追跡とスキーマ変更の管理がしやすくなります。
