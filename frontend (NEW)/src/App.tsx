import { useCallback, useState } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import { LeftNav } from './components/LeftNav'
import { GlobalSearchBar } from './components/GlobalSearchBar'
import { RecentlyOpened } from './components/RecentlyOpened'
import { SearchResults } from './components/SearchResults'
import { RightSidebar } from './components/RightSidebar'
import { SettingsModal } from './components/SettingsModal'

function Dashboard() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [searchActive, setSearchActive] = useState(false)

  const submitSearch = useCallback(() => {
    if (searchValue.trim().length > 0) setSearchActive(true)
  }, [searchValue])

  const clearSearch = useCallback(() => {
    setSearchActive(false)
    setSearchValue('')
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="flex min-h-0 flex-1">
        <LeftNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <GlobalSearchBar
            onOpenSettings={() => setSettingsOpen(true)}
            searchValue={searchValue}
            onSearchValueChange={setSearchValue}
            onSubmitSearch={submitSearch}
            searchActive={searchActive}
            onClearSearch={clearSearch}
          />
          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10">
              <div className="mx-auto max-w-4xl">
                {searchActive ? (
                  <SearchResults query={searchValue} />
                ) : (
                  <RecentlyOpened />
                )}
              </div>
            </main>
            <RightSidebar />
          </div>
        </div>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <Dashboard />
    </ThemeProvider>
  )
}
