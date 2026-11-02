import { TEXTURE_CROSS_ORIGIN, textureUrl } from "@/lib/texture-url";

/**
 * Icons are cells of sprite sheets, drawn as a CSS background. html-to-image
 * inlines a background by its URL, so every icon would carry its whole sheet
 * into an export (an SVG of a 30-card board came to 54 MB). For the length of
 * a capture, each cell under `root` wears only its own pixels, as a small data
 * URL; the returned function puts the sheets back.
 */
export async function inlineAtlasCells(root: HTMLElement): Promise<() => void> {
  const cells = [...root.querySelectorAll<HTMLElement>("[data-atlas-cell], [data-atlas-mask]")];
  if (cells.length === 0) return () => {};
  const sheets = new Map<string, Promise<HTMLImageElement | undefined>>();
  const cuts = new Map<string, Promise<string | undefined>>();
  const restores: Array<() => void> = [];

  await Promise.all(
    cells.map(async (element) => {
      // A background cell, or a cell used as a mask (aspects).
      const asMask = element.dataset.atlasMask !== undefined;
      const ref = (asMask ? element.dataset.atlasMask : element.dataset.atlasCell) ?? "";
      let cut = cuts.get(ref);
      if (!cut) {
        cut = cutCell(ref, sheets);
        cuts.set(ref, cut);
      }
      const dataUrl = await cut;
      if (!dataUrl) return;
      if (asMask) {
        const saved = element.getAttribute("style");
        element.style.setProperty("mask-image", `url("${dataUrl}")`);
        element.style.setProperty("-webkit-mask-image", `url("${dataUrl}")`);
        element.style.setProperty("mask-size", "100% 100%");
        element.style.setProperty("-webkit-mask-size", "100% 100%");
        element.style.setProperty("mask-position", "0 0");
        element.style.setProperty("-webkit-mask-position", "0 0");
        restores.push(() => {
          if (saved === null) element.removeAttribute("style");
          else element.setAttribute("style", saved);
        });
        return;
      }
      const { backgroundImage, backgroundSize, backgroundPosition } = element.style;
      element.style.backgroundImage = `url("${dataUrl}")`;
      element.style.backgroundSize = "100% 100%";
      element.style.backgroundPosition = "0 0";
      restores.push(() => {
        element.style.backgroundImage = backgroundImage;
        element.style.backgroundSize = backgroundSize;
        element.style.backgroundPosition = backgroundPosition;
      });
    }),
  );
  return () => {
    for (const restore of restores) restore();
  };
}

/** Runs a capture of `root` with its atlas cells inlined, then puts the sheets back. */
export async function withInlinedAtlasCells<T>(root: HTMLElement, capture: () => Promise<T>): Promise<T> {
  const restore = await inlineAtlasCells(root);
  try {
    return await capture();
  } finally {
    restore();
  }
}

async function cutCell(
  ref: string,
  sheets: Map<string, Promise<HTMLImageElement | undefined>>,
): Promise<string | undefined> {
  const hash = ref.lastIndexOf("#");
  const path = ref.slice(0, hash);
  const [x, y, width, height] = ref.slice(hash + 1).split(",").map(Number);
  if (!path || ![x, y, width, height].every((value) => Number.isFinite(value)) || !width || !height) {
    return undefined;
  }
  let sheet = sheets.get(path);
  if (!sheet) {
    sheet = new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = TEXTURE_CROSS_ORIGIN;
      image.onload = () => resolve(image);
      image.onerror = () => resolve(undefined);
      image.src = textureUrl(path);
    });
    sheets.set(path, sheet);
  }
  const image = await sheet;
  if (!image) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = width!;
  canvas.height = height!;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.drawImage(image, x!, y!, width!, height!, 0, 0, width!, height!);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    // A sheet from a host without CORS: keep the sheet, the export still draws it.
    return undefined;
  }
}
