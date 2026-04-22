import * as pdfjsLib from "pdfjs-dist";

// Tell Vite to resolve the local worker file from node_modules directly
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export async function getPdfPreview(filePath: string): Promise<string | null> {
  // Use Node's fs.promises to read the file asynchronously without blocking the React UI
  const fsPromises = (window as any).require ? (window as any).require("fs").promises : null;
  if (!fsPromises) return null;

  try {
    // Read file natively to safely bypass browser CORS and protocol restrictions
    const data = await fsPromises.readFile(filePath);
    const uint8Array = new Uint8Array(data);

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    // Get the first page
    const page = await pdf.getPage(1);
    
    // Scale the viewport so the thumbnail is roughly 256px wide (saves memory)
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = 256 / Math.max(viewport.width, viewport.height);
    const scaledViewport = page.getViewport({ scale });

    // Create a temporary hidden canvas
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return null;

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    // Render the PDF page onto the canvas
    await page.render({
      canvasContext: context,
      viewport: scaledViewport,
      canvas: canvas, // Passed to satisfy the TypeScript definition
    } as any).promise; // 'as any' prevents other version-specific TS errors

    // Return as a base64 image string
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch (error) {
    console.error("PDF preview generation failed:", error);
    return null;
  }
}