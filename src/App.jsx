import { useState, useEffect, useMemo } from 'react';
import Header from './components/Header';
import Breadcrumbs from './components/Breadcrumbs';
import FileList from './components/FileList';

const STORAGE_ENDPOINT = 'https://cdn.killobyte.es/files/';

const getPathFromUrl = () => {
  const path = window.location.pathname;
  if (path === '/') return '';
  return path.slice(1);
};

export default function App() {
  const [currentPath, setCurrentPath] = useState(getPathFromUrl());
  const [rawItems, setRawItems] = useState([]);
  const [globalItems, setGlobalItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [copiedName, setCopiedName] = useState(null);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(getPathFromUrl());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (search.length > 0) return;

    async function fetchDirectory() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${STORAGE_ENDPOINT}${currentPath}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        setRawItems(data.filter(i => !i.name.endsWith('.sha256') && i.name !== 'global_index.json'));
      } catch (err) {
        setError(err.message);
        setRawItems([]);
      } finally {
        setLoading(false);
      }
    }
    fetchDirectory();
  }, [currentPath, search]);

  const handleSearchChange = async (text) => {
    setSearch(text);
    if (text.trim().length > 0 && !globalItems) {
      setLoading(true);
      try {
        const res = await fetch(`${STORAGE_ENDPOINT}global_index.json`);
        if (res.ok) {
          const data = await res.json();
          setGlobalItems(data);
        }
      } catch (err) {
        console.error("Error reading index", err);
      } finally {
        setLoading(false);
      }
    }
  };

  const items = useMemo(() => {
    if (search.trim() !== '') {
      if (!globalItems) return [];
      return globalItems
        .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
        .map(item => ({ ...item, isGlobal: true }))
        .slice(0, 100);
    }

    return rawItems.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
  }, [rawItems, search, globalItems]);

  const handleCopy = (realPath) => {
    const fullUrl = `${window.location.origin}/files/${realPath}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedName(realPath);
    setTimeout(() => setCopiedName(null), 1500);
  };

  const handleNavigate = (path) => {
    setCurrentPath(path);
    setSearch('');
    window.history.pushState({}, '', `/${path}`);
  };

  return (
    <div className="kb-shell">
      <Header search={search} onSearchChange={handleSearchChange} count={items.length} />

      <main className="kb-container">
        <Breadcrumbs currentPath={currentPath} search={search} onNavigate={handleNavigate} />

        <FileList
          items={items}
          loading={loading && search.length > 0 && !globalItems}
          error={error}
          currentPath={currentPath}
          copiedName={copiedName}
          onNavigate={handleNavigate}
          onCopy={handleCopy}
        />

        <address>nginx en cdn.killobyte.es · {items.length} elementos</address>
      </main>

      <kb-footer />
    </div>
  );
}
