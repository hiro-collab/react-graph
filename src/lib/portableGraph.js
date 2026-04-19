const DEFAULT_TITLE = "Untitled Graph";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function nodeKindToFlowType(kind) {
  if (kind === "entry") {
    return "input";
  }

  if (kind === "exit") {
    return "output";
  }

  return undefined;
}

function flowTypeToNodeKind(type, fallbackKind) {
  if (type === "input") {
    return "entry";
  }

  if (type === "output") {
    return "exit";
  }

  return fallbackKind ?? "process";
}

export function normalizePortableGraph(value) {
  if (!value || typeof value !== "object") {
    throw new Error("JSON must be an object.");
  }

  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error("JSON must contain nodes and edges arrays.");
  }

  return {
    schemaVersion: 1,
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : DEFAULT_TITLE,
    nodes: value.nodes.map((node) => {
      const source = asObject(node);

      if (!source.id) {
        throw new Error("Every node needs an id.");
      }

      return {
        id: String(source.id),
        kind: typeof source.kind === "string" ? source.kind : "process",
        label: typeof source.label === "string" && source.label.trim() ? source.label : String(source.id),
        position: {
          x: Number(asObject(source.position).x ?? 0),
          y: Number(asObject(source.position).y ?? 0),
        },
        meta: asObject(source.meta),
      };
    }),
    edges: value.edges.map((edge) => {
      const source = asObject(edge);

      if (!source.from || !source.to) {
        throw new Error("Every edge needs from and to.");
      }

      return {
        id: String(source.id ?? `${source.from}-${source.to}`),
        from: String(source.from),
        to: String(source.to),
        label: typeof source.label === "string" ? source.label : "",
        meta: asObject(source.meta),
      };
    }),
  };
}

export function toFlowGraph(portableGraph) {
  return {
    nodes: portableGraph.nodes.map((node) => ({
      id: node.id,
      type: nodeKindToFlowType(node.kind),
      position: node.position,
      data: {
        label: node.label,
      },
    })),
    edges: portableGraph.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label || undefined,
      animated: Boolean(edge.meta?.animated),
    })),
  };
}

export function fromFlowGraph(flowNodes, flowEdges, previousGraph) {
  const previousNodes = new Map(previousGraph.nodes.map((node) => [node.id, node]));
  const previousEdges = new Map(previousGraph.edges.map((edge) => [edge.id, edge]));

  return normalizePortableGraph({
    schemaVersion: 1,
    title: previousGraph.title,
    nodes: flowNodes.map((node) => {
      const previousNode = previousNodes.get(node.id);

      return {
        id: node.id,
        kind: flowTypeToNodeKind(node.type, previousNode?.kind),
        label: String(node.data?.label ?? previousNode?.label ?? node.id),
        position: node.position,
        meta: previousNode?.meta ?? {},
      };
    }),
    edges: flowEdges.map((edge) => {
      const previousEdge = previousEdges.get(edge.id);

      return {
        id: edge.id,
        from: edge.source,
        to: edge.target,
        label: typeof edge.label === "string" ? edge.label : previousEdge?.label ?? "",
        meta: {
          ...previousEdge?.meta,
          animated: Boolean(edge.animated),
        },
      };
    }),
  });
}

export function nextNodeId(nodes) {
  const taken = new Set(nodes.map((node) => node.id));
  let index = nodes.length + 1;

  while (taken.has(`node-${index}`)) {
    index += 1;
  }

  return `node-${index}`;
}

export function toJson(graph) {
  return JSON.stringify(graph, null, 2);
}

export function toDownloadName(graph) {
  const base = (graph.title || DEFAULT_TITLE)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${base || "graph"}.graph.json`;
}
