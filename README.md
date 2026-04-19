# React Flow Test

このディレクトリは、構造をグラフとして眺めて編集しつつ、JSON を本体データとして持ち出せる最小実験場です。

現在は TouchDesigner の `/project1` にある構成を、React Flow 上で段階的に再現するテストも含みます。

## 目的

- React Flow を編集 UI として使う
- 本体は可搬な `graph JSON` にする
- ほかのツールに移すときは JSON を変換する

## ファイル

- `graphs/sample.graph.json`
  - 持ち出し前提のサンプルデータ
- `graphs/touchdesigner-project1.graph.json`
  - TouchDesigner `/project1` の level 1 再現用プリセット
- `graphs/touchdesigner-project1-level2.graph.json`
  - TouchDesigner `/project1` の level 2 再現用プリセット
- `graphs/portable-graph.schema.json`
  - JSON Schema
- `src/lib/portableGraph.js`
  - React Flow と portable graph の相互変換
- `src/lib/dataflowEngine.js`
  - graph JSON を簡単な dataflow として評価する実行部

## 使い方

```bash
npm install
npm run dev
```

ブラウザで JSON を直接貼り替えるか、`Download JSON` で保存して、別ツール側の変換に回せます。

`Load TD L1` と `Load TD L2` で、TouchDesigner `/project1` の再現プリセットを切り替えられます。

## TouchDesigner 再現の対象

MCP で確認した `/project1` は、主に次の流れです。

- `lfo1` (`lfoCHOP`)
  - `square`, `frequency=0.5`, `offset=0.5`, `amp=0.5`
- `null_switch_ctrl` (`nullCHOP`)
  - `lfo1` の値を受ける
- `noise1` (`noiseTOP`)
  - `simplex3d`, `256x256`, `tz=absTime.seconds`
- `thresh1`, `thresh2` (`thresholdTOP`)
  - `noise1` をしきい値で 2 系統に分ける
- `switch1` (`switchTOP`)
  - 2つの threshold 出力を `index` で切り替える
- `null_img_out` (`nullTOP`)
  - 切替結果の出力
- `null_switch_ctrl_export` (`tableDAT`)
  - `switch1.index` 向けの表現

このプロジェクトでは、上の構成を `graph JSON` と `dataflowEngine` で意味的に再現しています。

## 今回の到達点

- level 1
  - 赤と緑の定数画像を切り替える
- level 2
  - `noiseTOP` 相当のモノクロ画像を生成する
  - `thresholdTOP` 2系統を切り替える
  - `null_img_out` 相当のビューアで現在の出力画像を表示する
  - `LFO -> switch index -> output` の状態を確認できる

TOP/CHOP/DAT を TouchDesigner の演算系ごと再現しているわけではなく、今回の構成に必要な処理だけを絞って持ち込んでいます。

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
