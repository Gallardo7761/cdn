import FileItem from './FileItem';

export default function FileList({ items, loading, error, currentPath, copiedName, onNavigate, onCopy }) {
  if (loading) return <p className="kb-muted">Consultando CDN…</p>;
  if (error) return <p>Error al cargar archivos: {error}</p>;

  const parent = currentPath.split('/').filter(Boolean).slice(0, -1).join('/');
  const showParent = currentPath && !items[0]?.isGlobal;

  return (
    <div className="kb-scroll">
      <table className="index">
        <thead>
          <tr><th>Nombre</th><th>Última modificación</th><th>Tamaño</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {showParent && (
            <tr>
              <td colSpan={4}>
                <a href={`/${parent && `${parent}/`}`} onClick={(e) => { e.preventDefault(); onNavigate(parent && `${parent}/`); }}>
                  ../
                </a>{' '}
                <span className="kb-muted">Directorio superior</span>
              </td>
            </tr>
          )}
          {items.map((item) => (
            <FileItem
              key={item.name}
              item={item}
              currentPath={currentPath}
              copiedName={copiedName}
              onNavigate={onNavigate}
              onCopy={onCopy}
            />
          ))}
          {items.length === 0 && (
            <tr><td colSpan={4} className="kb-muted">Directorio vacío o sin coincidencias</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
