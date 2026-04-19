export function createEmptyGraphDocument(title = "Untitled Graph") {
  return {
    schemaVersion: 2,
    title,
    nodes: [],
    edges: [],
  };
}
