import * as pdfjsLib from "pdfjs-dist";

// Resolve the worker file for Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export async function getPdfPreview(filePath: string): Promise<string | null> {
  // Check if our secure bridge is available
  if (!window.electron?.ipcRenderer) return null;

  try {
    // 1. Read the file SECURELY through the Electron bridge
    const data = await window.electron.ipcRenderer.invoke('read-file-buffer', filePath);
    if (!data) return null;

    // 2. Convert the raw data to a Uint8Array for PDF.js
    const uint8Array = new Uint8Array(data);

    // 3. Load and render the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = 256 / Math.max(viewport.width, viewport.height);
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return null;

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    await page.render({
      canvasContext: context,
      viewport: scaledViewport,
      canvas: canvas,
    } as any).promise;

    // Return as a compressed JPEG to save memory
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch (error) {
    console.error("PDF engine failed to render:", filePath, error);
    return null;
  }
}