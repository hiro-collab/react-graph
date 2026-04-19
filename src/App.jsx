import { useCallback, useMemo, useRef, useState } from "react";
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
import {
  fromFlowGraph,
  nextNodeId,
  normalizePortableGraph,
  toDownloadName,
  toFlowGraph,
  toJson,
} from "./lib/portableGraph";

const STORAGE_KEY = "react-flow-test.graph";

function loadGraph() {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return normalizePortableGraph(sampleGraph);
  }

  try {
    return normalizePortableGraph(JSON.parse(raw));
  } catch {
    return normalizePortableGraph(sampleGraph);
  }
}

export default function App() {
  const [graph, setGraph] = useState(() => loadGraph());
  const [jsonText, setJsonText] = useState(() => toJson(loadGraph()));
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [status, setStatus] = useState("Ready");
  const fileInputRef = useRef(null);

  const flowGraph = useMemo(() => toFlowGraph(graph), [graph]);

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
          meta: {},
        },
      ],
    });

    persist(nextGraph);
    setSelectedNodeId(id);
    setStatus(`Added ${id}`);
  }, [graph, persist]);

  const resetGraph = useCallback(() => {
    persist(normalizePortableGraph(sampleGraph));
    setSelectedNodeId(null);
    setStatus("Reset to sample graph");
  }, [persist]);

  const applyJson = useCallback(() => {
    try {
      const parsed = normalizePortableGraph(JSON.parse(jsonText));
      persist(parsed);
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
          <p>可搬な graph JSON を本体にして、React Flow で編集する実験場。</p>
        </div>

        <div className="sidebar-section button-row">
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
              <input
                type="text"
                value={selectedNode.label}
                onChange={(event) => updateSelectedLabel(event.target.value)}
              />
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
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
        >
          <MiniMap pannable zoomable />
          <Controls />
          <Background gap={16} />
          <Panel position="top-left" className="flow-tip">
            Portable graph v{graph.schemaVersion}
          </Panel>
        </ReactFlow>
      </main>
    </div>
  );
}
