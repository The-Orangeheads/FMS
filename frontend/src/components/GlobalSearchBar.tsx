import { useRef } from "react";
import { IconImageSearch, IconSearch } from "./icons";
import { API_URL } from "../config";
import toast from "react-hot-toast";

type GlobalSearchBarProps = {
  onOpenSettings: () => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  onSearchStart: (query: string) => void;
  onSubmitInitialSearch: (results: any[]) => void;
  onSubmitFinalSearch: (results: any[]) => void;
  onSearchFailed: () => void;
};

export function GlobalSearchBar({
  searchValue,
  onSearchValueChange,
  onSearchStart,
  onSubmitInitialSearch,
  onSubmitFinalSearch,
  onSearchFailed,
}: GlobalSearchBarProps) {
  const activeRequestId = useRef(0);

  const runReverseImageSearch = async (selectedPath: string) => {
    const requestId = ++activeRequestId.current;
    onSearchStart(selectedPath);
    try {
      let res = await fetch(`${API_URL}/api/image/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: selectedPath,
        }),
      });

      // Compatibility fallback for current backend route naming.
      if (!res.ok && res.status === 404) {
        res = await fetch(`${API_URL}/api/vectors/image/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: selectedPath,
          }),
        });
      }

      if (!res.ok) {
        throw new Error(`Reverse image search failed: ${res.statusText}`);
      }

      const data = await res.json();
      if (requestId !== activeRequestId.current) return;
      onSubmitInitialSearch(data.results || []);
      onSubmitFinalSearch(data.results || []);
    } catch (error) {
      console.error("Reverse image search failed:", error);
      if (requestId !== activeRequestId.current) return;
      onSearchFailed();
    }
  };

  const handleImageSearch = async () => {
    if (window.electron?.ipcRenderer) {
      try {
        const pickedPath = await window.electron.ipcRenderer.invoke("open-image-picker");
        if (!pickedPath) return;
        
        // Clear text search value when searching by image
        onSearchValueChange(""); 
        
        await runReverseImageSearch(pickedPath);
        return;
      } catch (error) {
        console.error("Electron image picker failed:", error);
        toast.error("Failed to open the image picker.");
      }
    }
  };

  const handleSearch = async () => {
    if (searchValue.trim().length === 0) return;
    const requestId = ++activeRequestId.current;

    onSearchStart(searchValue);

    try {
      const initialRes = await fetch(`${API_URL}/api/vectors/unified/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: searchValue,
          rerank: false
        }),
      });

      if (!initialRes.ok) {
        throw new Error(`Search failed: ${initialRes.statusText}`);
      }

      const initialData = await initialRes.json();
      if (requestId !== activeRequestId.current) return;
      onSubmitInitialSearch(initialData.results || []);

      const finalRes = await fetch(`${API_URL}/api/vectors/unified/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: searchValue,
          rerank: true
        }),
      });

      if (!finalRes.ok) {
        throw new Error(`Rerank failed: ${finalRes.statusText}`);
      }

      const finalData = await finalRes.json();
      if (requestId !== activeRequestId.current) return;
      onSubmitFinalSearch(finalData.results || []);
    } catch (error) {
      console.error('Backend search failed:', error);
      toast.error("Search failed. Ensure the local server is running.");
      if (requestId !== activeRequestId.current) return;
      onSearchFailed();
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative">
        <label htmlFor="global-search" className="sr-only">
          Search files and semantic context
        </label>
        <form
          className="flex items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
        >
          <div className="relative flex-1">
            <div className="relative rounded-2xl border-2 border-border bg-surface-elevated shadow-soft transition-all duration-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 focus-within:shadow-card">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-foreground-muted">
                <IconSearch className="h-6 w-6" />
              </span>
                <input
                id="global-search"
                type="search"
                value={searchValue}
                onChange={(e) => onSearchValueChange(e.target.value)}
                placeholder="Search by meaning, text, or metadata…"
                className="w-full rounded-2xl border-0 bg-transparent py-5 pl-14 pr-12 text-lg text-foreground outline-none placeholder:text-foreground-muted/60 [&::-webkit-search-cancel-button]:hidden"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchValueChange("");
                    document.getElementById("global-search")?.focus();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Clear search"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
           <button
            type="button"
            title="Reverse image search"
            aria-label="Attach or search by image"
            onClick={handleImageSearch}
            className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-border bg-surface-muted text-foreground-muted transition-all duration-300 ease-material hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
          >
            <IconImageSearch className="h-6 w-6" />
          </button>
          <button
            onClick={handleSearch}
            type="submit"
            className="inline-flex h-14 items-center justify-center rounded-2xl bg-primary px-8 text-base font-semibold text-on-primary transition-all duration-300 ease-material hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-soft"
          >
            Search
          </button>
        </form>
      </div>
    </div>
  );
}
