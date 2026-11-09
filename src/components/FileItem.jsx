import { useState } from 'react';
import { formatBytes } from '@/util/format';

const formatDate = (mtime) => {
  if (!mtime) return '-';
  
  if (/^\d+(\.\d+)?$/.test(String(mtime))) {
    return new Date(parseFloat(mtime) * 1000).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
  
  return new Date(mtime).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

export default function FileItem({ item, currentPath, copiedName, onNavigate, onCopy }) {
  const isDir = item.type === 'directory';
  const realPath = item.isGlobal ? item.name : `${currentPath}${item.name}`;
  const downloadUrl = `/files/${realPath}`;
  const isCopied = copiedName === realPath;

  const [hashStatus, setHashStatus] = useState('idle');
  const [hashText, setHashText] = useState(null);

  const handleToggleHash = async (e) => {
    e.preventDefault();
    
    if (hashText) {
      setHashText(null);
      setHashStatus('idle');
      return;
    }

    setHashStatus('loading');
    try {
      const fetchUrl = window.location.hostname === 'localhost' 
        ? `https://cdn.killobyte.es/files/${realPath}.sha256` 
        : `/files/${realPath}.sha256`;

      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error();
      
      const text = await res.text();

      if (text.toLowerCase().includes('<!doctype') || text.toLowerCase().includes('<html')) {
        throw new Error("Tell the administrator that this is HTML");
      }

      const cleanHash = text.split(' ')[0]; 
      
      setHashText(cleanHash);
      setHashStatus('done');
    // eslint-disable-next-line no-unused-vars
    } catch (err) {
      setHashStatus('error');
      setTimeout(() => setHashStatus('idle'), 2000);
    }
  };

  const copyHashToClipboard = async (e) => {
    e.preventDefault();
    if (hashText) {
      await navigator.clipboard.writeText(hashText);
      setHashStatus('copied');
      setTimeout(() => setHashStatus('done'), 1500);
    }
  };

  const hashLabel = { loading: 'sha256…', error: 'sin hash' }[hashStatus] ?? (hashText ? 'ocultar' : 'sha256');

  return (
    <>
      <tr>
        <td>
          {isDir ? (
            <a href={`/${realPath}/`} onClick={(e) => { e.preventDefault(); onNavigate(`${realPath}/`); }}>
              {item.name}/
            </a>
          ) : (
            <a href={downloadUrl} download>{item.name}</a>
          )}
        </td>
        <td>{formatDate(item.mtime)}</td>
        <td>{isDir ? '-' : formatBytes(item.size)}</td>
        <td>
          {!isDir && (
            <>
              <button onClick={handleToggleHash} title="Mostrar SHA-256">{hashLabel}</button>
              <button onClick={(e) => { e.preventDefault(); onCopy(realPath); }} title="Copiar enlace">
                {isCopied ? 'copiado' : 'copiar enlace'}
              </button>
            </>
          )}
        </td>
      </tr>

      {hashText && (
        <tr className="hash">
          <td colSpan={4}>
            SHA-256: <code>{hashText}</code>
            <button onClick={copyHashToClipboard}>{hashStatus === 'copied' ? 'copiado' : 'copiar'}</button>
          </td>
        </tr>
      )}
    </>
  );
}
