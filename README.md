# Lexica: AI-Powered File Management System

<p align="center">
  <img src="frontend/src/assets/logo_dark.svg" alt="Lexica Logo" width="150" />
</p>

Lexica is a cross-platform desktop application that provides entirely offline, on-device semantic search and organization for documents, images, and PDFs. It utilizes multilingual embedding models and format-aware extraction to let users search their local files by content, meaning, and visual similarity, while automatically detecting near-duplicate files to optimize storage.

## Technical Details

**Architecture:** Decoupled client-server model packaged in an Electron container.
- **Frontend:** React 19, TypeScript, Vite, TailwindCSS 4, D3, pdfjs-dist
- **Backend:** Python, FastAPI (async, REST + WebSocket), organized into controllers → services → core modules
- **Databases:** SQLite (relational metadata, WAL mode) + ChromaDB (HNSW-based vector search)
- **ML Models:**
  - Text embeddings: BGE-M3 (multilingual, 8-bit quantized)
  - Vision/text-image embeddings: SigLIP 2 (FP16)
  - Reranking: bge-reranker-v2-m3 (Cross-Encoder)
  - OCR: RapidOCR (ONNX Runtime, CUDA-accelerated)
- **PDF processing:** PyMuPDF (fast extraction) + pdfplumber (table-aware extraction), converted to Markdown via pandas
- **Memory management:** Dynamic model swapping between GPU and CPU keeps peak VRAM usage under 4 GB

## Installation

### Prerequisites
- Python 3.10+
- Node.js
- Git
- CUDA-compatible GPU (recommended; CPU-only mode is supported)

### Backend
```bash
python -m venv venv
source venv/bin/activate      # Linux/macOS
.\venv\Scripts\Activate.ps1   # Windows

pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

### Frontend
```bash
cd frontend
npm install
```

## Configuration

Backend settings are loaded from `backend/.env` (Pydantic settings). Configurable values include:
- Text/vision model selection
- Chunk size and overlap
- Batch size
- Sync interval
- Search similarity thresholds
- OCR parameters

Settings can also be modified at runtime from the in-app Settings panel (tracked directories, sync interval, top-K results, theme) without restarting the server, via `/api/config/`.

## Usage

**Run the full application (frontend + backend):**
```bash
.\run_fms.sh      # Linux/macOS
.\run_fms.ps1     # Windows
```

**Run backend only:**
```bash
.\run_backend.sh [-r] [-d] [-p PORT]
```
`-r` enables auto-reload, `-d` enables debug mode, `-p` sets the port (default 8000).

**Run frontend only:**
```bash
.\run_frontend.sh
```
Starts the Vite dev server on port 5173 and launches Electron once the backend is ready.

Once running, add directories to track from the Settings panel. The sync engine walks tracked directories on an interval, extracts and embeds new or changed files, and updates the search index and duplicate graph automatically. Search is available from the home screen via natural-language text queries, directory-scoped queries, or reverse image search.

