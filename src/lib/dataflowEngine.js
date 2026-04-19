import { createNoise3D } from "simplex-noise";

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

function meanLuminance(image) {
  if (!image) {
    return 0;
  }

  if (image.kind === "solid") {
    const [r, g, b] = normalizeColor(image.color);
    return (r + g + b) / (255 * 3);
  }

  if (image.kind === "raster") {
    let total = 0;
    const pixels = image.pixels;

    for (let index = 0; index < pixels.length; index += 4) {
      total += pixels[index];
    }

    return total / ((pixels.length / 4) * 255);
  }

  return 0;
}

function createSolidImage(color, width = 64, height = 64) {
  const normalized = normalizeColor(color);

  return {
    kind: "solid",
    width,
    height,
    color: normalized,
    cssColor: colorToCss(normalized),
  };
}

function createRasterImage(width, height, pixels) {
  return {
    kind: "raster",
    width,
    height,
    pixels,
  };
}

function imageSummary(image) {
  if (!image) {
    return "no image";
  }

  if (image.kind === "solid") {
    return colorSummary(image.color);
  }

  return `${image.width}x${image.height} mean=${meanLuminance(image).toFixed(2)}`;
}

function mulberry32(seed) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseField(params, timeSeconds) {
  const width = numberOr(params.resolutionWidth, 256);
  const height = numberOr(params.resolutionHeight, 256);
  const seed = numberOr(params.seed, 1);
  const gain = numberOr(params.gain, 0.5);
  const harmonics = Math.max(1, Math.round(numberOr(params.harmonics, 1)));
  const spread = numberOr(params.spread, 2);
  const period = Math.max(0.0001, numberOr(params.period, 1));
  const amp = numberOr(params.amp, 0.5);
  const offset = numberOr(params.offset, 0.5);
  const exponent = Math.max(0.0001, numberOr(params.exponent, 1));
  const translateX = numberOr(params.translateX, 0);
  const translateY = numberOr(params.translateY, 0);
  const translateZ = params.translateZSource === "time" ? timeSeconds : numberOr(params.translateZ, 0);
  const noise3D = createNoise3D(mulberry32(seed));
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = translateX + (x / width) * spread;
      const ny = translateY + (y / height) * spread;
      let amplitude = 1;
      let frequency = 1 / period;
      let sum = 0;
      let totalAmplitude = 0;

      for (let octave = 0; octave < harmonics; octave += 1) {
        sum += noise3D(nx * frequency, ny * frequency, translateZ * frequency) * amplitude;
        totalAmplitude += amplitude;
        amplitude *= gain;
        frequency *= 2;
      }

      const normalized = totalAmplitude ? sum / totalAmplitude : 0;
      const remapped = clamp(offset + amp * normalized, 0, 1);
      const finalValue = clamp(remapped ** exponent, 0, 1);
      const channel = Math.round(finalValue * 255);
      const base = (y * width + x) * 4;

      pixels[base] = channel;
      pixels[base + 1] = channel;
      pixels[base + 2] = channel;
      pixels[base + 3] = 255;
    }
  }

  return createRasterImage(width, height, pixels);
}

function sampleImageChannel(image, pixelIndex, channelOffset) {
  if (image.kind === "solid") {
    return image.color[channelOffset];
  }

  return image.pixels[pixelIndex * 4 + channelOffset];
}

function thresholdImage(image, params) {
  const threshold = clamp(numberOr(params.threshold, 0.5), 0, 1);
  const comparator = String(params.comparator ?? "less").toLowerCase();
  const width = image.width;
  const height = image.height;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const r = sampleImageChannel(image, pixelIndex, 0);
    const g = sampleImageChannel(image, pixelIndex, 1);
    const b = sampleImageChannel(image, pixelIndex, 2);
    const luminance = (r + g + b) / (255 * 3);
    const isWhite = comparator === "less" ? luminance >= threshold : luminance < threshold;
    const channel = isWhite ? 255 : 0;
    const base = pixelIndex * 4;

    pixels[base] = channel;
    pixels[base + 1] = channel;
    pixels[base + 2] = channel;
    pixels[base + 3] = channel;
  }

  return createRasterImage(width, height, pixels);
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
    raw = wrapped < 0.5 ? -1 : 1;
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
    return imageSummary(value.image);
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
      const image = createSolidImage(color);
      state = {
        nodeId,
        valueType: "image",
        image,
        color,
        swatch: colorToCss(color),
        summary: colorSummary(color),
      };
    } else if (processor === "noise") {
      const image = noiseField(node.meta?.params ?? {}, timeSeconds);
      state = {
        nodeId,
        valueType: "image",
        image,
        summary: imageSummary(image),
      };
    } else if (processor === "threshold") {
      const inputImage = inputs.find((input) => input.value.valueType === "image")?.value?.image ?? null;
      const image = inputImage ? thresholdImage(inputImage, node.meta?.params ?? {}) : null;
      state = {
        nodeId,
        valueType: image ? "image" : "empty",
        image,
        summary: imageSummary(image),
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
        image: selected?.image,
        color: selected?.color,
        swatch: selected?.swatch,
        selectedIndex,
        selectedSource: imageInputs[selectedIndex]?.fromNode?.id ?? null,
        summary: `index=${rawIndex.toFixed(2)} -> input${selectedIndex} (${imageInputs[selectedIndex]?.fromNode?.id ?? "none"})`,
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
