import { createNodeFromType, getNodeVisual, resolveLegacyNodeType } from "./nodeRegistry.js";

const DEFAULT_TITLE = "Untitled Graph";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeMeta(rawMeta) {
  const source = asObject(rawMeta);
  const { params, processor, ...rest } = source;
  return rest;
}

function normalizeUi(node) {
  const ui = asObject(node.ui);
  const position = asObject(node.position);

  return {
    x: Number(ui.x ?? position.x ?? 0),
    y: Number(ui.y ?? position.y ?? 0),
  };
}

function inferInputPort(edgeSource) {
  if (typeof edgeSource?.meta?.targetPort === "string" && edgeSource.meta.targetPort) {
    return edgeSource.meta.targetPort;
  }

  if (typeof edgeSource?.meta?.targetSlot === "number") {
    return `input${edgeSource.meta.targetSlot}`;
  }

  return "in";
}

function normalizeEndpoint(endpoint, fallbackPort) {
  if (typeof endpoint === "string") {
    return {
      node: endpoint,
      port: fallbackPort,
    };
  }

  const source = asObject(endpoint);

  if (!source.node) {
    throw new Error("Edge endpoint requires a node.");
  }

  return {
    node: String(source.node),
    port: String(source.port ?? fallbackPort),
  };
}

export function normalizePortableGraph(value) {
  if (!value || typeof value !== "object") {
    throw new Error("JSON must be an object.");
  }

  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error("JSON must contain nodes and edges arrays.");
  }

  return {
    schemaVersion: 2,
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : DEFAULT_TITLE,
    nodes: value.nodes.map((node) => {
      const source = asObject(node);

      if (!source.id) {
        throw new Error("Every node needs an id.");
      }

      const type = resolveLegacyNodeType(source);
      const created = createNodeFromType(type, {
        id: String(source.id),
        label: typeof source.label === "string" && source.label.trim() ? source.label : String(source.id),
        kind: typeof source.kind === "string" ? source.kind : undefined,
        ui: normalizeUi(source),
        params: asObject(source.params).constructor === Object && Object.keys(asObject(source.params)).length
          ? asObject(source.params)
          : asObject(source.meta).params,
        meta: normalizeMeta(source.meta),
      });

      return created;
    }),
    edges: value.edges.map((edge) => {
      const source = asObject(edge);
      const from = normalizeEndpoint(source.from, "out");
      const to = normalizeEndpoint(source.to, inferInputPort(source));

      return {
        id: String(source.id ?? `${from.node}:${from.port}-${to.node}:${to.port}`),
        from,
        to,
        label: typeof source.label === "string" ? source.label : "",
        meta: asObject(source.meta),
      };
    }),
  };
}

function edgeStyle(meta) {
  const dataType = meta?.dataType;

  if (dataType === "signal") {
    return {
      stroke: "#5fc2aa",
      strokeDasharray: "6 4",
    };
  }

  if (dataType === "image") {
    return {
      stroke: "#f08b72",
    };
  }

  return {
    stroke: "#8c9590",
  };
}

export function toFlowGraph(graph, runtime = {}) {
  return {
    nodes: graph.nodes.map((node) => {
      const visual = getNodeVisual(node);
      return {
        id: node.id,
        type: "portableNode",
        position: node.ui,
        sourcePosition: "right",
        targetPosition: "left",
        data: {
          id: node.id,
          label: node.label,
          kind: visual.kind,
          graphType: node.type,
          typeLabel: visual.typeLabel,
          family: visual.family,
          operator: visual.operator,
          summary: runtime.nodeStates?.[node.id]?.summary ?? "",
          swatch: runtime.nodeStates?.[node.id]?.swatch ?? null,
          preview: runtime.nodeStates?.[node.id]?.image ?? null,
        },
      };
    }),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.from.node,
      sourceHandle: edge.from.port,
      target: edge.to.node,
      targetHandle: edge.to.port,
      label: edge.label || edge.to.port || undefined,
      animated: Boolean(edge.meta?.animated),
      style: edgeStyle(edge.meta),
    })),
  };
}

export function fromFlowGraph(flowNodes, flowEdges, previousGraph) {
  const previousNodes = new Map(previousGraph.nodes.map((node) => [node.id, node]));
  const previousEdges = new Map(previousGraph.edges.map((edge) => [edge.id, edge]));

  return normalizePortableGraph({
    schemaVersion: previousGraph.schemaVersion ?? 2,
    title: previousGraph.title,
    nodes: flowNodes.map((node) => {
      const previousNode = previousNodes.get(node.id) ?? createNodeFromType("generic.process", { id: node.id });

      return {
        id: node.id,
        type: previousNode.type,
        kind: previousNode.kind,
        label: String(node.data?.label ?? previousNode.label ?? node.id),
        ui: node.position,
        params: previousNode.params,
        meta: previousNode.meta,
      };
    }),
    edges: flowEdges.map((edge) => {
      const previousEdge = previousEdges.get(edge.id);

      return {
        id: edge.id,
        from: {
          node: edge.source,
          port: edge.sourceHandle ?? previousEdge?.from?.port ?? "out",
        },
        to: {
          node: edge.target,
          port: edge.targetHandle ?? previousEdge?.to?.port ?? "in",
        },
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
