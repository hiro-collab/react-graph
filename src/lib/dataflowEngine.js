function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function numberOr(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeColor(rawColor) {
  const source = Array.isArray(rawColor) ? rawColor : [255, 255, 255, 255];
  const color = source.slice(0, 4);

  while (color.length < 4) {
    color.push(255);
  }

  return color.map((channel, index) => {
    const safe = numberOr(channel, index === 3 ? 255 : 0);
    return clamp(Math.round(safe), 0, 255);
  });
}

function colorToCss(color) {
  const [r, g, b, a] = normalizeColor(color);
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

function colorSummary(color) {
  const [r, g, b, a] = normalizeColor(color);
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
}

function evaluateWave(params, timeSeconds) {
  const waveType = String(params.waveType ?? "sine").toLowerCase();
  const frequency = numberOr(params.frequency, 1);
  const offset = numberOr(params.offset, 0);
  const amp = numberOr(params.amp, 1);
  const phase = numberOr(params.phase, 0) / 360;
  const cycle = timeSeconds * frequency + phase;
  const wrapped = cycle - Math.floor(cycle);
  let raw = Math.sin(cycle * Math.PI * 2);

  if (waveType === "square") {
    raw = wrapped < 0.5 ? 1 : -1;
  } else if (waveType === "triangle") {
    raw = 1 - 4 * Math.abs(wrapped - 0.5);
  } else if (waveType === "saw") {
    raw = 2 * wrapped - 1;
  }

  return offset + amp * raw;
}

function summarizeValue(value) {
  if (value == null) {
    return "no value";
  }

  if (value.valueType === "signal") {
    return `chan1=${numberOr(value.value, 0).toFixed(2)}`;
  }

  if (value.valueType === "image") {
    return colorSummary(value.color);
  }

  if (value.valueType === "table") {
    return value.summary ?? "table";
  }

  return value.summary ?? String(value.value ?? "");
}

export function evaluateGraph(graph, timeSeconds) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingByNode = new Map(graph.nodes.map((node) => [node.id, []]));

  for (const edge of graph.edges) {
    if (incomingByNode.has(edge.to)) {
      incomingByNode.get(edge.to).push(edge);
    }
  }

  for (const edges of incomingByNode.values()) {
    edges.sort((left, right) => {
      const leftSlot = numberOr(left.meta?.targetSlot, Number.MAX_SAFE_INTEGER);
      const rightSlot = numberOr(right.meta?.targetSlot, Number.MAX_SAFE_INTEGER);

      if (leftSlot !== rightSlot) {
        return leftSlot - rightSlot;
      }

      return left.from.localeCompare(right.from);
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
      fromNode: nodesById.get(edge.from),
      value: computeNode(edge.from, nextStack),
    }));

    const processor = node.meta?.processor ?? "passthrough";
    let state;

    if (processor === "constantColor") {
      const color = normalizeColor(node.meta?.params?.color);
      state = {
        nodeId,
        valueType: "image",
        color,
        swatch: colorToCss(color),
        summary: colorSummary(color),
      };
    } else if (processor === "lfo") {
      const value = evaluateWave(node.meta?.params ?? {}, timeSeconds);
      state = {
        nodeId,
        valueType: "signal",
        value,
        summary: `chan1=${value.toFixed(2)}`,
      };
    } else if (processor === "switch") {
      const controlInput =
        inputs.find((input) => input.edge.meta?.targetPort === "index") ??
        inputs.find((input) => input.value.valueType === "signal");
      const imageInputs = inputs.filter((input) => input.value.valueType === "image");
      const rawIndex = numberOr(controlInput?.value?.value, 0);
      const selectedIndex = imageInputs.length
        ? clamp(Math.round(rawIndex), 0, imageInputs.length - 1)
        : 0;
      const selected = imageInputs[selectedIndex]?.value ?? null;

      state = {
        nodeId,
        valueType: selected?.valueType ?? "empty",
        value: selected?.value,
        color: selected?.color,
        swatch: selected?.swatch,
        selectedIndex,
        selectedSource: imageInputs[selectedIndex]?.fromNode?.id ?? null,
        summary: `index=${rawIndex.toFixed(2)} -> input${selectedIndex}`,
      };
    } else if (processor === "exportTable") {
      const signal = inputs.find((input) => input.value.valueType === "signal")?.value;
      const currentIndex = Math.round(numberOr(signal?.value, 0));
      const channelName = String(node.meta?.params?.channelName ?? "chan1");
      const targetPath = String(node.meta?.params?.targetPath ?? "switch1");
      const targetParameter = String(node.meta?.params?.targetParameter ?? "index");
      const rows = [
        ["name", "index", "path", "parameter", "enable"],
        [channelName, String(currentIndex), targetPath, targetParameter, "1"],
      ];

      state = {
        nodeId,
        valueType: "table",
        rows,
        text: rows.map((row) => row.join("\t")).join("\n"),
        summary: `${channelName} -> ${targetPath}.${targetParameter}`,
      };
    } else if (processor === "annotation") {
      state = {
        nodeId,
        valueType: "note",
        summary: String(node.meta?.notes ?? "annotation"),
      };
    } else {
      const firstInput = inputs[0]?.value ?? null;
      state = firstInput
        ? {
            ...firstInput,
            nodeId,
            summary: summarizeValue(firstInput),
          }
        : {
            nodeId,
            valueType: "empty",
            summary: "no input",
          };
    }

    cache.set(nodeId, state);
    return state;
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
    primaryOutput: primaryOutputNode ? nodeStates[primaryOutputNode.id] : null,
  };
}
