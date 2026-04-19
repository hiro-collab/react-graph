import { getNodeDefinition } from "./nodeRegistry.js";

function inputSortKey(edge) {
  if (typeof edge.meta?.targetSlot === "number") {
    return edge.meta.targetSlot;
  }

  if (typeof edge.to?.port === "string") {
    const match = edge.to.port.match(/^input(\d+)$/);

    if (match) {
      return Number(match[1]);
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

export function evaluateGraph(graph, timeSeconds) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingByNode = new Map(graph.nodes.map((node) => [node.id, []]));

  for (const edge of graph.edges) {
    if (incomingByNode.has(edge.to.node)) {
      incomingByNode.get(edge.to.node).push(edge);
    }
  }

  for (const edges of incomingByNode.values()) {
    edges.sort((left, right) => {
      const leftKey = inputSortKey(left);
      const rightKey = inputSortKey(right);

      if (leftKey !== rightKey) {
        return leftKey - rightKey;
      }

      return `${left.from.node}:${left.from.port}`.localeCompare(`${right.from.node}:${right.from.port}`);
    });
  }

  const cache = new Map();

  function computeNode(nodeId, stack = new Set()) {
    if (cache.has(nodeId)) {
      return cache.get(nodeId);
    }

    const node = nodesById.get(nodeId);

    if (!node) {
      const missing = {
        nodeId,
        valueType: "error",
        summary: "missing node",
      };
      cache.set(nodeId, missing);
      return missing;
    }

    if (stack.has(nodeId)) {
      const cyclic = {
        nodeId,
        valueType: "error",
        summary: "cycle detected",
      };
      cache.set(nodeId, cyclic);
      return cyclic;
    }

    const nextStack = new Set(stack);
    nextStack.add(nodeId);

    const inputs = (incomingByNode.get(nodeId) ?? []).map((edge) => ({
      edge,
      fromNode: nodesById.get(edge.from.node),
      value: computeNode(edge.from.node, nextStack),
    }));

    const definition = getNodeDefinition(node.type);

    try {
      const state = definition.execute({
        node,
        inputs,
        timeSeconds,
      });

      cache.set(nodeId, state);
      return state;
    } catch (error) {
      const failed = {
        nodeId,
        valueType: "error",
        summary: error instanceof Error ? error.message : "execution failed",
      };
      cache.set(nodeId, failed);
      return failed;
    }
  }

  for (const node of graph.nodes) {
    computeNode(node.id);
  }

  const nodeStates = Object.fromEntries(cache);
  const primaryOutputNode =
    graph.nodes.find((node) => node.meta?.primaryOutput) ??
    graph.nodes.find((node) => node.kind === "exit") ??
    null;

  return {
    nodeStates,
    primaryOutputNode,
    primaryOutput: primaryOutputNode ? nodeStates[primaryOutputNode.id] : null,
  };
}
