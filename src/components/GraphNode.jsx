import { Handle, Position } from "@xyflow/react";

export default function GraphNode({ data }) {
  const isNote = data.kind === "note";

  return (
    <div className={`graph-node graph-node--${data.kind}`}>
      {!isNote ? <Handle type="target" position={Position.Left} /> : null}

      <div className="graph-node__header">
        <div className="graph-node__text">
          <div className="graph-node__title">{data.label}</div>
          <div className="graph-node__subtitle">
            {[data.family, data.operator].filter(Boolean).join(" / ")}
          </div>
        </div>
        {data.swatch ? <div className="graph-node__swatch" style={{ background: data.swatch }} /> : null}
      </div>

      {data.summary ? <div className="graph-node__summary">{data.summary}</div> : null}

      {!isNote ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}
