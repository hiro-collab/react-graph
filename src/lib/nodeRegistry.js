import { createNoise3D } from "simplex-noise";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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

    for (let index = 0; index < image.pixels.length; index += 4) {
      total += image.pixels[index];
    }

    return total / ((image.pixels.length / 4) * 255);
  }

  return 0;
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

function sampleImageChannel(image, pixelIndex, channelOffset) {
  if (image.kind === "solid") {
    return image.color[channelOffset];
  }

  return image.pixels[pixelIndex * 4 + channelOffset];
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
    return `value=${numberOr(value.value, 0).toFixed(2)}`;
  }

  if (value.valueType === "image") {
    return imageSummary(value.image);
  }

  if (value.valueType === "table") {
    return value.summary ?? "table";
  }

  return value.summary ?? String(value.value ?? "");
}

function primaryInput(inputs) {
  return inputs[0]?.value ?? null;
}

function noteState(node) {
  return {
    nodeId: node.id,
    valueType: "note",
    summary: String(node.meta?.notes ?? node.label ?? "note"),
  };
}

const nodeDefinitions = {
  "generic.entry": {
    type: "generic.entry",
    title: "Entry",
    kind: "entry",
    family: "FLOW",
    operator: "entry",
    defaultParams: {},
    execute: ({ node, inputs }) => {
      const input = primaryInput(inputs);
      return input
        ? {
            ...input,
            nodeId: node.id,
            summary: summarizeValue(input),
          }
        : noteState(node);
    },
  },
  "generic.process": {
    type: "generic.process",
    title: "Process",
    kind: "process",
    family: "FLOW",
    operator: "process",
    defaultParams: {},
    execute: ({ node, inputs }) => {
      const input = primaryInput(inputs);
      return input
        ? {
            ...input,
            nodeId: node.id,
            summary: summarizeValue(input),
          }
        : {
            nodeId: node.id,
            valueType: "empty",
            summary: node.meta?.notes ?? "no input",
          };
    },
  },
  "generic.exit": {
    type: "generic.exit",
    title: "Exit",
    kind: "exit",
    family: "FLOW",
    operator: "exit",
    defaultParams: {},
    execute: ({ node, inputs }) => {
      const input = primaryInput(inputs);
      return input
        ? {
            ...input,
            nodeId: node.id,
            summary: summarizeValue(input),
          }
        : {
            nodeId: node.id,
            valueType: "empty",
            summary: "no output",
          };
    },
  },
  "generic.note": {
    type: "generic.note",
    title: "Note",
    kind: "note",
    family: "FLOW",
    operator: "note",
    defaultParams: {},
    execute: ({ node }) => noteState(node),
  },
  "generic.passthrough": {
    type: "generic.passthrough",
    title: "Pass-through",
    kind: "process",
    family: "FLOW",
    operator: "pass",
    defaultParams: {},
    execute: ({ node, inputs }) => {
      const input = primaryInput(inputs);
      return input
        ? {
            ...input,
            nodeId: node.id,
            summary: summarizeValue(input),
          }
        : {
            nodeId: node.id,
            valueType: "empty",
            summary: "no input",
          };
    },
  },
  "signal.lfo": {
    type: "signal.lfo",
    title: "LFO",
    kind: "process",
    family: "CHOP",
    operator: "lfoCHOP",
    defaultParams: {
      waveType: "square",
      frequency: 0.5,
      offset: 0.5,
      amp: 0.5,
      phase: 0,
      channelName: "chan1",
    },
    execute: ({ node, timeSeconds }) => {
      const value = evaluateWave(node.params, timeSeconds);
      const channelName = String(node.params.channelName ?? "value");

      return {
        nodeId: node.id,
        valueType: "signal",
        channelName,
        value,
        summary: `${channelName}=${value.toFixed(2)}`,
      };
    },
  },
  "image.constant": {
    type: "image.constant",
    title: "Constant Image",
    kind: "entry",
    family: "TOP",
    operator: "constantTOP",
    defaultParams: {
      color: [255, 255, 255, 255],
    },
    execute: ({ node }) => {
      const color = normalizeColor(node.params.color);
      const image = createSolidImage(color);

      return {
        nodeId: node.id,
        valueType: "image",
        image,
        color,
        swatch: colorToCss(color),
        summary: colorSummary(color),
      };
    },
  },
  "image.noise": {
    type: "image.noise",
    title: "Noise Image",
    kind: "process",
    family: "TOP",
    operator: "noiseTOP",
    defaultParams: {
      type: "simplex3d",
      seed: 1,
      period: 1,
      harmonics: 2,
      spread: 2,
      gain: 0.7,
      roughness: 0.5,
      exponent: 1,
      amp: 0.5,
      offset: 0.5,
      mono: true,
      translateX: 0,
      translateY: 0,
      translateZSource: "time",
      resolutionWidth: 256,
      resolutionHeight: 256,
    },
    execute: ({ node, timeSeconds }) => {
      const image = noiseField(node.params, timeSeconds);

      return {
        nodeId: node.id,
        valueType: "image",
        image,
        summary: imageSummary(image),
      };
    },
  },
  "image.threshold": {
    type: "image.threshold",
    title: "Threshold",
    kind: "process",
    family: "TOP",
    operator: "thresholdTOP",
    defaultParams: {
      comparator: "less",
      threshold: 0.5,
    },
    execute: ({ node, inputs }) => {
      const inputImage = inputs.find((input) => input.value.valueType === "image")?.value?.image ?? null;
      const image = inputImage ? thresholdImage(inputImage, node.params) : null;

      return {
        nodeId: node.id,
        valueType: image ? "image" : "empty",
        image,
        summary: imageSummary(image),
      };
    },
  },
  "logic.switch": {
    type: "logic.switch",
    title: "Switch",
    kind: "process",
    family: "TOP",
    operator: "switchTOP",
    defaultParams: {},
    execute: ({ node, inputs }) => {
      const controlInput =
        inputs.find((input) => input.edge.to.port === "index") ??
        inputs.find((input) => input.value.valueType === "signal");
      const imageInputs = inputs
        .filter((input) => input.value.valueType === "image")
        .sort((left, right) => {
          const leftIndex = Number(left.edge.to.port?.replace("input", "") ?? Number.MAX_SAFE_INTEGER);
          const rightIndex = Number(right.edge.to.port?.replace("input", "") ?? Number.MAX_SAFE_INTEGER);
          return leftIndex - rightIndex;
        });
      const rawIndex = numberOr(controlInput?.value?.value, 0);
      const selectedIndex = imageInputs.length
        ? clamp(Math.round(rawIndex), 0, imageInputs.length - 1)
        : 0;
      const selected = imageInputs[selectedIndex]?.value ?? null;

      return {
        nodeId: node.id,
        valueType: selected?.valueType ?? "empty",
        value: selected?.value,
        image: selected?.image,
        color: selected?.color,
        swatch: selected?.swatch,
        selectedIndex,
        selectedSource: imageInputs[selectedIndex]?.fromNode?.id ?? null,
        inputStates: imageInputs.map((input, index) => ({
          index,
          nodeId: input.fromNode?.id ?? `input${index}`,
          port: input.edge.to.port,
          image: input.value.image ?? null,
          summary: input.value.summary ?? imageSummary(input.value.image),
        })),
        summary: `index=${rawIndex.toFixed(2)} -> input${selectedIndex} (${imageInputs[selectedIndex]?.fromNode?.id ?? "none"})`,
      };
    },
  },
  "data.exportTable": {
    type: "data.exportTable",
    title: "Export Table",
    kind: "process",
    family: "DAT",
    operator: "tableDAT",
    defaultParams: {
      targetPath: "switch1",
      targetParameter: "index",
      channelName: "chan1",
    },
    execute: ({ node, inputs }) => {
      const signal = inputs.find((input) => input.value.valueType === "signal")?.value;
      const currentIndex = Math.round(numberOr(signal?.value, 0));
      const channelName = String(node.params.channelName ?? "chan1");
      const targetPath = String(node.params.targetPath ?? "switch1");
      const targetParameter = String(node.params.targetParameter ?? "index");
      const rows = [
        ["name", "index", "path", "parameter", "enable"],
        [channelName, String(currentIndex), targetPath, targetParameter, "1"],
      ];

      return {
        nodeId: node.id,
        valueType: "table",
        rows,
        text: rows.map((row) => row.join("\t")).join("\n"),
        summary: `${channelName} -> ${targetPath}.${targetParameter}`,
      };
    },
  },
};

const fallbackDefinition = {
  type: "generic.process",
  title: "Unknown",
  kind: "process",
  family: "FLOW",
  operator: "unknown",
  defaultParams: {},
  execute: ({ node, inputs }) => {
    const input = primaryInput(inputs);
    return input
      ? {
          ...input,
          nodeId: node.id,
          summary: summarizeValue(input),
        }
      : {
          nodeId: node.id,
          valueType: "empty",
          summary: "no handler",
        };
  },
};

const legacyProcessorMap = {
  annotation: "generic.note",
  constantColor: "image.constant",
  exportTable: "data.exportTable",
  lfo: "signal.lfo",
  noise: "image.noise",
  passthrough: "generic.passthrough",
  switch: "logic.switch",
  threshold: "image.threshold",
};

const templateTypes = [
  "generic.entry",
  "generic.process",
  "generic.exit",
  "generic.note",
  "signal.lfo",
  "image.constant",
  "image.noise",
  "image.threshold",
  "logic.switch",
  "data.exportTable",
];

export function resolveLegacyNodeType(node) {
  if (typeof node?.type === "string" && node.type.trim()) {
    return node.type;
  }

  if (typeof node?.meta?.processor === "string" && legacyProcessorMap[node.meta.processor]) {
    return legacyProcessorMap[node.meta.processor];
  }

  if (node?.kind === "note") {
    return "generic.note";
  }

  if (node?.kind === "entry") {
    return "generic.entry";
  }

  if (node?.kind === "exit") {
    return "generic.exit";
  }

  return "generic.process";
}

export function getNodeDefinition(type) {
  return nodeDefinitions[type] ?? fallbackDefinition;
}

export function getNodeVisual(node) {
  const definition = getNodeDefinition(resolveLegacyNodeType(node));

  return {
    type: resolveLegacyNodeType(node),
    typeLabel: definition.title,
    family: node.meta?.family ?? definition.family,
    operator: node.meta?.operator ?? definition.operator,
    kind: node.kind ?? definition.kind,
  };
}

export function listNodeTemplates() {
  return templateTypes.map((type) => {
    const definition = getNodeDefinition(type);

    return {
      type,
      label: definition.title,
      kind: definition.kind,
      family: definition.family,
      operator: definition.operator,
    };
  });
}

export function createNodeFromType(type, init = {}) {
  const definition = getNodeDefinition(type);

  return {
    id: init.id,
    type,
    kind: init.kind ?? definition.kind,
    label: init.label ?? definition.title,
    ui: init.ui ?? { x: 0, y: 0 },
    params: {
      ...clone(definition.defaultParams ?? {}),
      ...(init.params ?? {}),
    },
    meta: {
      ...(init.meta ?? {}),
    },
  };
}
