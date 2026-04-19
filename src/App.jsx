import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import sampleGraph from "../graphs/sample.graph.json";
import tdProjectGraph from "../graphs/touchdesigner-project1.graph.json";
import GraphNode from "./components/GraphNode";
import { evaluateGraph } from "./lib/dataflowEngine";
import {
  fromFlowGraph,
  nextNodeId,
  normalizePortableGraph,
  toDownloadName,
  toFlowGraph,
  toJson,
} from "./lib/portableGraph";

const STORAGE_KEY = "react-flow-test.portable-graph.v2";
const nodeTypes = {
  portableNode: GraphNode,
};

function loadGraph() {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return normalizePortableGraph(tdProjectGraph);
  }

  try {
    return normalizePortableGraph(JSON.parse(raw));
  } catch {
    return normalizePortableGraph(tdProjectGraph);
  }
}

export default function App() {
  const [graph, setGraph] = useState(() => loadGraph());
  const [jsonText, setJsonText] = useState(() => toJson(loadGraph()));
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const fileInputRef = useRef(null);
  const simulation = useMemo(() => evaluateGraph(graph, elapsedMs / 1000), [elapsedMs, graph]);
  const flowGraph = useMemo(() => toFlowGraph(graph, simulation), [graph, simulation]);
  const outputPreview = simulation.primaryOutput?.swatch ?? "rgba(24, 24, 24, 1)";

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const startedAt = performance.now() - elapsedMs;
    const interval = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt);
    }, 100);

    return () => window.clearInterval(interval);
  }, [elapsedMs, isPlaying]);

  const persist = useCallback((nextGraph) => {
    setGraph(nextGraph);
    setJsonText(toJson(nextGraph));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextGraph));
  }, []);

  const onNodesChange = useCallback(
    (changes) => {
      const nextNodes = applyNodeChanges(changes, flowGraph.nodes);
      persist(fromFlowGraph(nextNodes, flowGraph.edges, graph));
    },
    [flowGraph.edges, flowGraph.nodes, graph, persist],
  );

  const onEdgesChange = useCallback(
    (changes) => {
      const nextEdges = applyEdgeChanges(changes, flowGraph.edges);
      persist(fromFlowGraph(flowGraph.nodes, nextEdges, graph));
    },
    [flowGraph.edges, flowGraph.nodes, graph, persist],
  );

  const onConnect = useCallback(
    (connection) => {
      const nextEdges = addEdge(
        {
          ...connection,
          id: `e-${connection.source}-${connection.target}-${Date.now()}`,
          animated: true,
        },
        flowGraph.edges,
      );
      persist(fromFlowGraph(flowGraph.nodes, nextEdges, graph));
    },
    [flowGraph.edges, flowGraph.nodes, graph, persist],
  );

  const addNode = useCallback(() => {
    const id = nextNodeId(graph.nodes);
    const nextGraph = normalizePortableGraph({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id,
          kind: "process",
          label: `Node ${graph.nodes.length + 1}`,
          position: {
            x: 160 + graph.nodes.length * 40,
            y: 80 + graph.nodes.length * 28,
          },
          meta: {
            family: "GENERIC",
            operator: "process",
            processor: "passthrough",
          },
        },
      ],
    });

    persist(nextGraph);
    setSelectedNodeId(id);
    setStatus(`Added ${id}`);
  }, [graph, persist]);

  const resetGraph = useCallback(() => {
    persist(normalizePortableGraph(tdProjectGraph));
    setSelectedNodeId(null);
    setElapsedMs(0);
    setStatus("Reset to sample graph");
  }, [persist]);

  const applyJson = useCallback(() => {
    try {
      const parsed = normalizePortableGraph(JSON.parse(jsonText));
      persist(parsed);
      setElapsedMs(0);
      setStatus("Applied JSON");
    } catch (error) {
      setStatus(error.message);
    }
  }, [jsonText, persist]);

  const syncJson = useCallback(() => {
    const text = toJson(graph);
    setJsonText(text);
    setStatus("Synced JSON");
  }, [graph]);

  const downloadJson = useCallback(() => {
    const text = toJson(graph);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = toDownloadName(graph);
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${toDownloadName(graph)}`);
  }, [graph]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const importFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      try {
        const parsed = normalizePortableGraph(JSON.parse(await file.text()));
        persist(parsed);
        setElapsedMs(0);
        setStatus(`Loaded ${file.name}`);
      } catch (error) {
        setStatus(error.message);
      } finally {
        event.target.value = "";
      }
    },
    [persist],
  );

  const loadPreset = useCallback(
    (preset, label) => {
      persist(normalizePortableGraph(preset));
      setElapsedMs(0);
      setSelectedNodeId(null);
      setStatus(`Loaded ${label}`);
    },
    [persist],
  );

  const selectedNode = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );
  const selectedState = selectedNode ? simulation.nodeStates[selectedNode.id] : null;
  const exportTable = simulation.nodeStates.null_switch_ctrl_export?.text ?? "";
  const switchState = simulation.nodeStates.switch1?.summary ?? "n/a";
  const lfoState = simulation.nodeStates.lfo1?.summary ?? "n/a";
  const selectedInputIndex = simulation.nodeStates.switch1?.selectedIndex ?? 0;
  const sourcePreviews = [
    {
      id: "constant1",
      label: "input0",
      swatch: simulation.nodeStates.constant1?.swatch ?? "rgba(24, 24, 24, 1)",
    },
    {
      id: "constant2",
      label: "input1",
      swatch: simulation.nodeStates.constant2?.swatch ?? "rgba(24, 24, 24, 1)",
    },
  ];

  const updateSelectedLabel = useCallback(
    (label) => {
      if (!selectedNode) {
        return;
      }

      const nextNodes = graph.nodes.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              label,
            }
          : node,
      );

      persist({ ...graph, nodes: nextNodes });
    },
    [graph, persist, selectedNode],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-section">
          <h1>Graph Playground</h1>
          <p>TouchDesigner の小さな dataflow を graph JSON と React Flow で再現する実験場。</p>
        </div>

        <div className="sidebar-section button-row">
          <button type="button" onClick={() => loadPreset(tdProjectGraph, "TD /project1 preset")}>
            Load TD preset
          </button>
          <button type="button" onClick={() => loadPreset(sampleGraph, "basic sample")}>
            Load sample
          </button>
          <button type="button" onClick={addNode}>
            Add node
          </button>
          <button type="button" onClick={downloadJson}>
            Download JSON
          </button>
          <button type="button" onClick={openFilePicker}>
            Load file
          </button>
          <button type="button" onClick={applyJson}>
            Apply JSON
          </button>
          <button type="button" onClick={syncJson}>
            Sync text
          </button>
          <button type="button" className="secondary" onClick={resetGraph}>
            Reset
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.graph.json"
            onChange={importFile}
            hidden
          />
        </div>

        <div className="sidebar-section runtime-panel">
          <div className="section-heading">Runtime</div>
          <div className="button-row compact-row">
            <button type="button" onClick={() => setIsPlaying((value) => !value)}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setElapsedMs(0);
                setStatus("Time reset");
              }}
            >
              Reset time
            </button>
          </div>
          <div className="runtime-grid">
            <div>Time</div>
            <div>{(elapsedMs / 1000).toFixed(1)}s</div>
            <div>LFO</div>
            <div>{lfoState}</div>
            <div>Switch</div>
            <div>{switchState}</div>
          </div>
          <div className="viewer-card">
            <div className="viewer-card__label">null_img_out</div>
            <div className="viewer-surface" style={{ background: outputPreview }} />
          </div>
          <div className="source-strip">
            {sourcePreviews.map((source, index) => (
              <div
                key={source.id}
                className={`source-chip ${selectedInputIndex === index ? "source-chip--active" : ""}`}
              >
                <div className="source-chip__swatch" style={{ background: source.swatch }} />
                <div>{source.label}</div>
              </div>
            ))}
          </div>
          <pre className="export-table">{exportTable}</pre>
        </div>

        <div className="sidebar-section">
          <div className="field-label">Title</div>
          <input
            type="text"
            value={graph.title}
            onChange={(event) => persist({ ...graph, title: event.target.value })}
          />
        </div>

        <div className="sidebar-section">
          <label className="field-label" htmlFor="graph-json">
            Graph JSON
          </label>
          <textarea
            id="graph-json"
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="sidebar-section">
          <div className="field-label">Selected node</div>
          {selectedNode ? (
            <div className="node-editor">
              <div className="node-meta">{selectedNode.id}</div>
              <div className="node-meta">
                {[selectedNode.meta?.family, selectedNode.meta?.operator].filter(Boolean).join(" / ")}
              </div>
              <input
                type="text"
                value={selectedNode.label}
                onChange={(event) => updateSelectedLabel(event.target.value)}
              />
              <div className="hint">{selectedState?.summary ?? "no runtime state"}</div>
            </div>
          ) : (
            <div className="hint">ノードを選ぶとラベルを直接編集できます。</div>
          )}
        </div>

        <div className="sidebar-section status-line">{status}</div>
      </aside>

      <main className="canvas-shell">
        <ReactFlow
          nodes={flowGraph.nodes}
          edges={flowGraph.edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
        >
          <MiniMap pannable zoomable />
          <Controls />
          <Background gap={16} />
          <Panel position="top-left" className="flow-tip">
            TD recreation / v{graph.schemaVersion}
          </Panel>
          <Panel position="top-right" className="viewer-overlay">
            <div className="viewer-card viewer-card--overlay">
              <div className="viewer-card__label">TOP Viewer</div>
              <div className="viewer-surface viewer-surface--overlay" style={{ background: outputPreview }} />
              <div className="viewer-caption">{switchState}</div>
            </div>
          </Panel>
        </ReactFlow>
      </main>
    </div>
  );
}
