import { useCallback, useEffect, useState } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { GlobalSearchBar } from "./components/GlobalSearchBar";
import { RecentlyOpened } from "./components/RecentlyOpened";
import { SearchResults } from "./components/SearchResults";
import { SettingsModal } from "./components/SettingsModal";
import { CleanupStorage } from "./components/CleanupStorage";
import { StorageDonut } from "./components/StorageDonut";
import { ActivityEmbedding } from "./components/ActivityEmbedding";
import {
  IconSettings,
  IconChevronLeft,
  IconChevronRight,
} from "./components/icons";
import logo from "./assets/logo.svg";

type View = "main" | "search" | "recents" | "cleanup" | "embedding";

function Dashboard() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentView, setCurrentView] = useState<View>("main");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const handleBreakpoint = (event: MediaQueryListEvent | MediaQueryList) => {
      setSidebarOpen(event.matches);
    };

    handleBreakpoint(mediaQuery);
    mediaQuery.addEventListener("change", handleBreakpoint);
    return () => mediaQuery.removeEventListener("change", handleBreakpoint);
  }, []);

  const submitSearch = useCallback((results: any[]) => {
    setSearchResults(results);
    setIsSearching(false);
  }, []);

  const startSearch = useCallback((query: string) => {
    if (query.trim().length > 0) {
      setSearchQuery(query);
      setSearchResults([]);
      setIsSearching(true);
      setCurrentView("search");
    }
  }, []);

  const goToMain = useCallback(() => setCurrentView("main"), []);
  const goToRecents = useCallback(() => setCurrentView("recents"), []);
  const goToCleanup = useCallback(() => setCurrentView("cleanup"), []);
  const goToEmbedding = useCallback(() => setCurrentView("embedding"), []);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="flex min-h-0 flex-1">
        {/* Left Sidebar - Fixed */}
        <aside
          className={`fixed left-0 top-0 z-10 h-screen w-[min(100%,300px)] flex-col border-r border-border bg-surface-elevated/95 shadow-soft backdrop-blur-sm transition-transform duration-300 ease-out lg:flex ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex-shrink-0 border-b border-border px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-row items-center gap-3">
                <span className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl">
                  <img src={logo} alt="Shelf logo" className="h-12 w-12" />
                </span>
                <p className="text-2xl font-semibold leading-tight text-foreground">
                  Shelf
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-surface-muted text-foreground-muted transition hover:bg-surface-elevated hover:text-foreground"
                aria-label="Collapse sidebar"
              >
                <IconChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-hidden">
            <div className="space-y-6">
              <section className="rounded-[1.75rem] border border-border bg-surface-elevated p-4 shadow-soft">
                <div className="mb-3">
                  <p className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
                    Storage analytics
                  </p>
                </div>
                <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-[1.5rem] bg-surface-muted p-4">
                  <StorageDonut usedTotalLabel="186 GB" />
                </div>
              </section>

              <div className="rounded-[1.75rem] border border-border bg-surface-elevated p-4 shadow-soft">
                <ActivityEmbedding onViewAll={goToEmbedding} />
              </div>
            </div>
          </div>

          {/* Settings at bottom - Fixed */}
          <div className="flex-shrink-0 border-t border-border px-5 py-4">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-left text-sm font-medium text-foreground transition hover:bg-surface-elevated"
            >
              <IconSettings className="h-5 w-5 text-foreground-muted" />
              Settings
            </button>
          </div>
        </aside>

        {/* Main Content - Scrollable */}
        <div
          className={`flex min-w-0 flex-1 flex-col transition-all duration-300 ease-out ${sidebarOpen ? "lg:ml-[min(100%,300px)]" : "lg:ml-0"}`}
        >
          {!sidebarOpen ? (
            <>
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="fixed left-4 top-6 z-20 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-muted text-foreground-muted transition hover:bg-surface-elevated hover:text-foreground"
                aria-label="Show sidebar"
              >
                <IconChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="fixed left-4 bottom-6 z-20 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-muted text-foreground-muted transition hover:bg-surface-elevated hover:text-foreground"
                aria-label="Open settings"
              >
                <IconSettings className="h-4 w-4" />
              </button>
            </>
          ) : null}
          <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10">
            <div className="mx-auto max-w-4xl">
              {currentView === "search" ? (
                <div key="search" className="animate-slide-up">
                  <div className="mb-6">
                    <button
                      onClick={goToMain}
                      className="mb-5 inline-flex items-center gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-base font-semibold text-foreground transition hover:bg-surface-elevated"
                    >
                      Back
                    </button>
                    <GlobalSearchBar
                      onOpenSettings={() => setSettingsOpen(true)}
                      searchValue={searchValue}
                      onSearchValueChange={setSearchValue}
                      onSearchStart={startSearch}
                      onSubmitSearch={submitSearch}
                    />
                  </div>
                  <section className="rounded-[2rem] border border-border bg-surface-elevated/90 p-6 shadow-soft">
                    <SearchResults
                      query={searchQuery}
                      results={searchResults}
                      isLoading={isSearching}
                    />
                  </section>
                </div>
              ) : currentView === "recents" ? (
                <div key="recents" className="animate-slide-up">
                  <button
                    onClick={goToMain}
                    className="mb-4 inline-flex items-center gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-base font-semibold text-foreground transition hover:bg-surface-elevated"
                  >
                    Back
                  </button>
                  <section className="rounded-[2rem] border border-border bg-surface-elevated/90 p-6 shadow-soft">
                    <RecentlyOpened />
                  </section>
                </div>
              ) : currentView === "cleanup" ? (
                <div key="cleanup" className="animate-slide-up">
                  <button
                    onClick={goToMain}
                    className="mb-4 inline-flex items-center gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-base font-semibold text-foreground transition hover:bg-surface-elevated"
                  >
                    Back
                  </button>
                  <section className="rounded-[2rem] border border-border bg-surface-elevated/90 p-6 shadow-soft">
                    <h2 className="text-center mb-4 text-3xl font-bold text-foreground">
                      Cleanup Storage
                    </h2>
                    <CleanupStorage />
                  </section>
                </div>
              ) : currentView === "embedding" ? (
                <div key="embedding" className="animate-slide-up">
                  <button
                    onClick={goToMain}
                    className="mb-4 inline-flex items-center gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-base font-semibold text-foreground transition hover:bg-surface-elevated"
                  >
                    Back
                  </button>
                  <section className="rounded-[2rem] border border-border bg-surface-elevated/90 p-6 shadow-soft">
                    <h2 className="text-center mb-4 text-3xl font-bold text-foreground">
                      Embedding activity
                    </h2>
                    <ActivityEmbedding onViewAll={goToEmbedding} showFull />
                  </section>
                </div>
              ) : (
                // Main view
                <div key="main" className="animate-slide-up space-y-10">
                  <section className="rounded-4xl border border-border bg-surface-elevated/90 px-8 py-14 text-center shadow-soft">
                    <p className="text-sm font-semibold uppercase tracking-[0.35em] text-primary">
                      Search your library
                    </p>
                    <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">
                      Find documents, notes, and images instantly.
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-foreground-muted">
                      Enter a keyword, phrase, or metadata search term to
                      explore your AI-powered library.
                    </p>
                    <div className="mt-10">
                      <GlobalSearchBar
                        onOpenSettings={() => setSettingsOpen(true)}
                        searchValue={searchValue}
                        onSearchValueChange={setSearchValue}
                        onSearchStart={startSearch}
                        onSubmitSearch={submitSearch}
                      />
                    </div>
                  </section>

                  <section className="relative rounded-4xl border border-border bg-surface-elevated/90 p-6 shadow-soft">
                    <h2 className="text-center text-3xl font-bold text-foreground">
                      Recently opened
                    </h2>
                    <button
                      onClick={goToRecents}
                      className="absolute top-8 right-6 text-sm font-bold text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      View all
                    </button>
                    <div className="mt-6">
                      <RecentlyOpened hideHeader maxItems={4} />
                    </div>
                  </section>

                  <section className="relative rounded-[2rem] border border-border bg-surface-elevated/90 p-6 shadow-soft">
                    <h2 className="text-center text-3xl font-bold text-foreground">
                      Storage cleanup
                    </h2>
                    <button
                      onClick={goToCleanup}
                      className="absolute top-8 right-6 text-sm font-bold text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      View all
                    </button>
                    <div className="mt-6">
                      <CleanupStorage />
                    </div>
                  </section>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Dashboard />
    </ThemeProvider>
  );
}
