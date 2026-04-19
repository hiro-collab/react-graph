import { useEffect, useRef } from "react";

function fillCanvas(ctx, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}

export default function ImagePreview({ image, className, emptyLabel = "No image" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const width = image?.width ?? 256;
    const height = image?.height ?? 256;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    ctx.imageSmoothingEnabled = false;

    if (!image) {
      fillCanvas(ctx, width, height, "#111213");
      return;
    }

    if (image.kind === "solid") {
      fillCanvas(ctx, width, height, image.cssColor);
      return;
    }

    if (image.kind === "raster") {
      const data = image.pixels instanceof Uint8ClampedArray ? image.pixels : new Uint8ClampedArray(image.pixels);
      const imageData = new ImageData(data, image.width, image.height);
      ctx.putImageData(imageData, 0, 0);
      return;
    }

    fillCanvas(ctx, width, height, "#111213");
  }, [image]);

  return (
    <div className="image-preview">
      <canvas ref={canvasRef} className={className} />
      {!image ? <div className="image-preview__empty">{emptyLabel}</div> : null}
    </div>
  );
}
