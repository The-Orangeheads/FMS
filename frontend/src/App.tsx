import { useCallback, useEffect, useState } from "react";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { GlobalSearchBar } from "./components/GlobalSearchBar";
import { RecentlyOpened } from "./components/RecentlyOpened";
import { SearchResults } from "./components/SearchResults";
import { SettingsModal } from "./components/SettingsModal";
import DuplicateGraph from "./components/CleanupStorage";
import { StorageDonut } from "./components/StorageDonut";
import { ActivityEmbedding } from "./components/ActivityEmbedding";
import {
  IconSettings,
  IconChevronLeft,
  IconChevronRight,
} from "./components/icons";
import logoLight from "./assets/logo_light.svg";
import logoDark from "./assets/logo_dark.svg";
import { Toaster } from "react-hot-toast";
import { API_URL } from "./config";

const WAIT_FOR_BACKEND = true;

type View = "main" | "search" | "recents" | "cleanup" | "embedding";

// --- STARTUP LOADER COMPONENT ---
function StartupLoader({ onReveal, onReady }: { onReveal: () => void; onReady: () => void }) {
  const [status, setStatus] = useState("Loading app...");
  const [showFadeOut, setShowFadeOut] = useState(false);
  const { theme } = useTheme();
  const logoSrc = theme === "dark" ? logoDark : logoLight;

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;

    if (!WAIT_FOR_BACKEND) {
        setTimeout(() => {
            setStatus("All Ready!")
            setTimeout(() => {
            if (isMounted) {
                setShowFadeOut(true);
                onReveal();
                setTimeout(onReady, 1000); 
            }
            }, 750);
        }, 750);
        return () => { isMounted = false; };
    }

    const checkConnection = async () => {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);
        
        // Initiate the sync
        const response = await fetch(`${API_URL}/api/directory/sync`, { 
          method: "POST",
          signal: controller.signal 
        });
        clearTimeout(id);
        
        if (!response.ok) {
          throw new Error(`Backend responded with status: ${response.status}`);
        }
        
        if (isMounted) {
          setStatus("All Ready!");
          
          setTimeout(() => {
            if (isMounted) {
              setShowFadeOut(true);
              onReveal();
              setTimeout(onReady, 1000); 
            }
          }, 750);
        }
      } catch (error) {
        if (isMounted) {
          retryCount++;
          setStatus(
            retryCount > 2 
              ? "Waiting for backend..." 
              : "Loading app..."
          );
          setTimeout(checkConnection, 2500);
        }
      }
    };

    setTimeout(checkConnection, 500);

    return () => { isMounted = false; };
  }, [onReveal, onReady]);

  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface/90 backdrop-blur-2xl transition-all duration-800 ease-out ${
        showFadeOut ? "opacity-0 pointer-events-none scale-150" : "opacity-100 scale-100"
      }`}
    >
      <div className="flex flex-col items-center justify-center space-y-12">
        
        {/* Apple-style Logo & Typography Group */}
        <div className="flex items-center gap-5">
          <img 
            src={logoSrc} 
            alt="Lexica" 
            className="h-24 w-24 object-contain drop-shadow-sm" 
          />
          <div className="flex flex-col">
            <h1 className="font-spartan text-[70px] font-extrabold leading-[0.85] tracking-tight text-foreground">
              Lexica
            </h1>
            <p className="font-spartan text-[14px] font-medium tracking-tight text-foreground/50">
              AI Powered File Management System
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex flex-col items-center space-y-4">
          {status === "All Ready!" ? (
            <svg
              className="h-6 w-6 text-foreground/50 transition-opacity duration-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            // Jumping dots animation
            <div className="flex h-6 items-center justify-center space-x-1.5">
              <div 
                className="h-2 w-2 animate-bounce rounded-full bg-foreground/40" 
                style={{ animationDelay: "0ms" }}
              />
              <div 
                className="h-2 w-2 animate-bounce rounded-full bg-foreground/40" 
                style={{ animationDelay: "150ms" }}
              />
              <div 
                className="h-2 w-2 animate-bounce rounded-full bg-foreground/40" 
                style={{ animationDelay: "300ms" }}
              />
            </div>
          )}
          
          <span className="text-[13px] font-medium tracking-tight text-foreground/50 transition-all duration-300">
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}

// --- MAIN DASHBOARD COMPONENT ---
function Dashboard({ isRevealed = true }: { isRevealed?: boolean }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { theme } = useTheme();
  const logoSrc = theme === "dark" ? logoDark : logoLight;
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isReranking, setIsReranking] = useState(false);
  const [resultsAnimationKey, setResultsAnimationKey] = useState(0);
  const [currentView, setCurrentView] = useState<View>("main");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [transitionSpeed, setTransitionSpeed] = useState("duration-800");
  const [analytics, setAnalytics] = useState<{
    [key: string]: number[];
  } | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const handleBreakpoint = (event: MediaQueryListEvent | MediaQueryList) => {
      setSidebarOpen(event.matches);
    };

    handleBreakpoint(mediaQuery);
    mediaQuery.addEventListener("change", handleBreakpoint);
    return () => mediaQuery.removeEventListener("change", handleBreakpoint);
  }, []);

  useEffect(() => {
    if (isRevealed) {
      const timer = setTimeout(() => {
        setTransitionSpeed("duration-300");
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isRevealed]);

  const submitInitialSearch = useCallback((results: any[]) => {
    setSearchResults(results);
    setIsSearching(false);
    setIsReranking(true);
  }, []);

  const submitFinalSearch = useCallback((results: any[]) => {
    setSearchResults(results);
    setIsSearching(false);
    setIsReranking(false);
    setResultsAnimationKey((prev) => prev + 1);
  }, []);

  const failSearch = useCallback(() => {
    setSearchResults([]);
    setIsSearching(false);
    setIsReranking(false);
  }, []);

  const startSearch = useCallback((query: string) => {
    if (query.trim().length > 0) {
      setSearchQuery(query);
      setSearchResults([]);
      setIsSearching(true);
      setIsReranking(false);
      setCurrentView("search");
    }
  }, []);

  const goToMain = useCallback(() => {
    setCurrentView("main");
    setSearchValue("");
    setSearchQuery("");
  }, []);
  const goToRecents = useCallback(() => setCurrentView("recents"), []);
  const goToCleanup = useCallback(() => setCurrentView("cleanup"), []);
  const goToEmbedding = useCallback(() => setCurrentView("embedding"), []);

  const totalStorageSize = analytics
    ? Object.values(analytics).reduce((sum, [, , , size]) => sum + size, 0)
    : 0;

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  const usedTotalLabel = analytics ? formatBytes(totalStorageSize) : "0 B";

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="flex min-h-0 flex-1">
        {/* Left Sidebar - Sliding in on reveal */}
        <aside
          className={`fixed left-0 top-0 z-10 flex h-screen w-[min(100%,300px)] flex-col border-r border-border bg-surface-elevated/95 shadow-soft backdrop-blur-sm transition-transform ${transitionSpeed} ease-out ${
            sidebarOpen && isRevealed ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex-shrink-0 border-b border-border px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-row items-center gap-2.5">
                <span className="flex shrink-0 items-center justify-center">
                  <img src={logoSrc} alt="Lexica logo" className="h-[52px] w-[52px]" />
                </span>
                <div className="flex flex-col justify-center pt-1">
                  <h1 className="font-spartan text-[38px] font-extrabold leading-[0.85] tracking-tight text-foreground">
                    Lexica
                  </h1>
                </div>
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

          <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-hidden">
            <div className="space-y-6">
              <section className="rounded-[1.75rem] border border-border bg-surface-elevated p-4 shadow-soft">
                <div className="mb-3">
                  <p className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
                    Storage analytics
                  </p>
                </div>
                <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-[1.5rem] bg-surface-muted p-4">
                  <StorageDonut
                    usedTotalLabel={usedTotalLabel}
                    analytics={analytics as any}
                  />
                </div>
              </section>

              <div className="rounded-[1.75rem] border border-border bg-surface-elevated p-4 shadow-soft">
                <ActivityEmbedding
                  onViewAll={goToEmbedding}
                  onAnalyticsUpdate={setAnalytics}
                />
              </div>
            </div>
          </div>

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

        {/* Main Content - Shifting correctly as sidebar slides */}
        <div
          className={`flex min-w-0 flex-1 flex-col transition-all ${transitionSpeed} ease-out ${sidebarOpen && isRevealed ? "lg:ml-[min(100%,300px)]" : "lg:ml-0"}`}
        >
          {!sidebarOpen ? (
            <>
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className={`fixed left-4 top-6 z-20 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-muted text-foreground-muted transition-all duration-500 hover:bg-surface-elevated hover:text-foreground ${isRevealed ? "opacity-100 translate-y-0 delay-300" : "opacity-0 -translate-y-4"}`}
                aria-label="Show sidebar"
              >
                <IconChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className={`fixed left-4 bottom-6 z-20 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-muted text-foreground-muted transition-all duration-500 hover:bg-surface-elevated hover:text-foreground ${isRevealed ? "opacity-100 translate-y-0 delay-300" : "opacity-0 translate-y-4"}`}
                aria-label="Open settings"
              >
                <IconSettings className="h-4 w-4" />
              </button>
            </>
          ) : null}
          
          <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10">
            <div className="mx-auto max-w-4xl">
              {currentView === "search" ? (
                <div key="search" className={isRevealed ? "animate-slide-up" : "opacity-0"}>
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
                      onSubmitInitialSearch={submitInitialSearch}
                      onSubmitFinalSearch={submitFinalSearch}
                      onSearchFailed={failSearch}
                    />
                  </div>
                  <section className="rounded-[2rem] border border-border bg-surface-elevated/90 p-6 shadow-soft">
                    <SearchResults
                      query={searchQuery}
                      results={searchResults}
                      isLoading={isSearching}
                      isReranking={isReranking}
                      animationKey={resultsAnimationKey}
                    />
                  </section>
                </div>
              ) : currentView === "recents" ? (
                <div key="recents" className={isRevealed ? "animate-slide-up" : "opacity-0"}>
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
                <div key="cleanup" className={isRevealed ? "animate-slide-up" : "opacity-0"}>
                  <button
                    onClick={goToMain}
                    className="mb-4 inline-flex items-center gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-base font-semibold text-foreground transition hover:bg-surface-elevated"
                  >
                    Back
                  </button>
                  <section className="rounded-[2rem] border border-border bg-surface-elevated/90 p-6 shadow-soft">
                    <h2 className="text-center text-3xl font-bold text-foreground">
                      Storage cleanup
                    </h2>
                    <p className="mt-2 mb-6 text-center text-sm text-foreground-muted">
                      Identify and remove duplicate files to free up disk space and optimize your storage.
                    </p>
                    <DuplicateGraph />
                  </section>
                </div>
              ) : currentView === "embedding" ? (
                <div key="embedding" className={isRevealed ? "animate-slide-up" : "opacity-0"}>
                  <button
                    onClick={goToMain}
                    className="mb-4 inline-flex items-center gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-base font-semibold text-foreground transition hover:bg-surface-elevated"
                  >
                    Back
                  </button>
                  <section className="rounded-[2rem] border border-border bg-surface-elevated/90 p-6 shadow-soft">
                    <h2 className="text-center text-3xl font-bold text-foreground">
                      Embedding activity
                    </h2>
                    <p className="mt-2 mb-6 text-center text-sm text-foreground-muted">
                      Monitor the real-time progress of AI preprocessing and vector embeddings for your files.
                    </p>
                    <ActivityEmbedding onViewAll={goToEmbedding} showFull />
                  </section>
                </div>
              ) : (
                // Main view - slides up on reveal
                <div key="main" className={`${isRevealed ? "animate-slide-up" : "opacity-0"} space-y-10`}>
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
                        onSubmitInitialSearch={submitInitialSearch}
                        onSubmitFinalSearch={submitFinalSearch}
                        onSearchFailed={failSearch}
                      />
                    </div>
                  </section>

                   <section className="relative rounded-4xl border border-border bg-surface-elevated/90 p-6 shadow-soft">
                    <h2 className="text-center text-3xl font-bold text-foreground">
                      Recently opened
                    </h2>
                    <p className="mt-2 text-center text-sm text-foreground-muted">
                      Quickly jump back into your recently viewed files.
                    </p>
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
                    <p className="mt-2 text-center text-sm text-foreground-muted">
                      Identify and remove duplicate files to free up disk space and optimize your storage.
                    </p>
                    <button
                      onClick={goToCleanup}
                      className="absolute top-8 right-6 text-sm font-bold text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      View all
                    </button>
                    <div className="mt-6">
                      <DuplicateGraph />
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
  const [appState, setAppState] = useState<'loading' | 'revealing' | 'ready'>('loading');

  return (
    <ThemeProvider>
      {/* Dashboard is mounted instantly, but we only flag it to reveal 
          its visual animations once the loading screen starts fading out */}
      <Dashboard isRevealed={appState !== 'loading'} />
      
      {appState !== 'ready' && (
        <StartupLoader 
          onReveal={() => setAppState('revealing')} 
          onReady={() => setAppState('ready')} 
        />
      )}
      
      <Toaster 
        position="bottom-right" 
        toastOptions={{
          className: 'bg-surface-elevated text-foreground border border-border shadow-soft rounded-xl text-sm font-medium',
          style: {
            background: 'var(--color-surface-elevated)',
            color: 'var(--color-foreground)',
            borderColor: 'var(--color-border)'
          }
        }} 
      />
    </ThemeProvider>
  );
}