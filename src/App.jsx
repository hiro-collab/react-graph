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
import GraphNode from "./components/GraphNode.jsx";
import ImagePreview from "./components/ImagePreview.jsx";
import { evaluateGraph } from "./lib/dataflowEngine.js";
import { createEmptyGraphDocument } from "./lib/graphDocument.js";
import {
  createNodeFromType,
  getNodeVisual,
  listNodeTemplates,
} from "./lib/nodeRegistry.js";
import {
  fromFlowGraph,
  nextNodeId,
  normalizePortableGraph,
  toDownloadName,
  toFlowGraph,
  toJson,
} from "./lib/portableGraph.js";

const STORAGE_KEY = "react-flow-test.portable-graph.v4";
const nodeTypes = {
  portableNode: GraphNode,
};
const templates = listNodeTemplates();

function loadGraph() {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return normalizePortableGraph(createEmptyGraphDocument("Untitled Graph"));
  }

  try {
    return normalizePortableGraph(JSON.parse(raw));
  } catch {
    return normalizePortableGraph(createEmptyGraphDocument("Untitled Graph"));
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

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    let frameId = 0;
    const startedAt = performance.now() - elapsedMs;

    const tick = () => {
      setElapsedMs(performance.now() - startedAt);
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
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
      setStatus("Connected nodes");
    },
    [flowGraph.edges, flowGraph.nodes, graph, persist],
  );

  const addNodeFromType = useCallback(
    (type) => {
      const id = nextNodeId(graph.nodes);
      const nextGraph = normalizePortableGraph({
        ...graph,
        nodes: [
          ...graph.nodes,
          createNodeFromType(type, {
            id,
            ui: {
              x: 140 + graph.nodes.length * 36,
              y: 80 + graph.nodes.length * 24,
            },
          }),
        ],
      });

      persist(nextGraph);
      setSelectedNodeId(id);
      setStatus(`Added ${type}`);
    },
    [graph, persist],
  );

  const resetGraph = useCallback(() => {
    persist(normalizePortableGraph(createEmptyGraphDocument("Untitled Graph")));
    setSelectedNodeId(null);
    setElapsedMs(0);
    setStatus("Created empty graph");
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
    setJsonText(toJson(graph));
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

  const selectedNode = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );
  const selectedState = selectedNode ? simulation.nodeStates[selectedNode.id] : null;
  const selectedVisual = selectedNode ? getNodeVisual(selectedNode) : null;
  const primaryOutputLabel = simulation.primaryOutputNode?.label ?? "Primary output";
  const primaryOutputSummary = simulation.primaryOutput?.summary ?? "no output";
  const outputImage = simulation.primaryOutput?.image ?? null;
  const selectedImage = selectedState?.image ?? null;
  const graphStats = `${graph.nodes.length} nodes / ${graph.edges.length} edges`;

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
          <h1>Typed Graph Tool</h1>
          <p>typed graph document と node registry を使う汎用グラフエディタ。</p>
        </div>

        <div className="sidebar-section">
          <div className="section-heading">Document</div>
          <div className="button-row">
            <button type="button" onClick={resetGraph}>
              New graph
            </button>
            <button type="button" className="secondary" onClick={syncJson}>
              Sync text
            </button>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-heading">Templates</div>
          <div className="template-grid">
            {templates.map((template) => (
              <button key={template.type} type="button" className="secondary template-button" onClick={() => addNodeFromType(template.type)}>
                {template.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-section button-row">
          <button type="button" onClick={downloadJson}>
            Download JSON
          </button>
          <button type="button" onClick={openFilePicker}>
            Load file
          </button>
          <button type="button" onClick={applyJson}>
            Apply JSON
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
            <div>Graph</div>
            <div>{graphStats}</div>
            <div>Output</div>
            <div>{primaryOutputSummary}</div>
          </div>
          <div className="viewer-card">
            <div className="viewer-card__label">{primaryOutputLabel}</div>
            <ImagePreview image={outputImage} className="viewer-surface" emptyLabel="No image output" />
            <div className="viewer-caption">{primaryOutputSummary}</div>
          </div>
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
                {[selectedNode.type, selectedVisual?.family, selectedVisual?.operator].filter(Boolean).join(" / ")}
              </div>
              <input
                type="text"
                value={selectedNode.label}
                onChange={(event) => updateSelectedLabel(event.target.value)}
              />
              {selectedImage ? <ImagePreview image={selectedImage} className="selected-preview" emptyLabel="No image" /> : null}
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
            Typed graph / v{graph.schemaVersion}
          </Panel>
          <Panel position="top-right" className="viewer-overlay">
            <div className="viewer-card viewer-card--overlay">
              <div className="viewer-card__label">{primaryOutputLabel}</div>
              <ImagePreview image={outputImage} className="viewer-surface viewer-surface--overlay" emptyLabel="No image output" />
              <div className="viewer-caption">{primaryOutputSummary}</div>
            </div>
          </Panel>
        </ReactFlow>
      </main>
    </div>
  );
}
