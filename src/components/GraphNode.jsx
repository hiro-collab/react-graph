import { Handle, Position } from "@xyflow/react";
import ImagePreview from "./ImagePreview.jsx";

export default function GraphNode({ data }) {
  const isNote = data.kind === "note";
  const hasImage = Boolean(data.preview);

  return (
    <div className={`graph-node graph-node--${data.kind}`}>
      {!isNote ? <Handle type="target" position={Position.Left} /> : null}

      <div className="graph-node__header">
        <div className="graph-node__text">
          <div className="graph-node__title">{data.label}</div>
          <div className="graph-node__subtitle">
            {[data.typeLabel, data.family, data.operator].filter(Boolean).join(" / ")}
          </div>
        </div>
        {data.swatch ? <div className="graph-node__swatch" style={{ background: data.swatch }} /> : null}
      </div>

      {hasImage ? <ImagePreview image={data.preview} className="graph-node__preview" /> : null}

      {data.summary ? <div className="graph-node__summary">{data.summary}</div> : null}

      {!isNote ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}
