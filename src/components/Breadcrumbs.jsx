export default function Breadcrumbs({ currentPath, search, onNavigate }) {
  if (search.trim()) return <h1>Resultados para «{search}»</h1>;

  const parts = currentPath.split('/').filter(Boolean);
  const link = (label, target) => (
    <a href={`/${target}`} onClick={(e) => { e.preventDefault(); onNavigate(target); }}>{label}</a>
  );

  return (
    <h1>
      Índice de {link('/', '')}
      {parts.map((folder, index) => (
        <span key={index}>
          {index === parts.length - 1 ? folder : link(folder, parts.slice(0, index + 1).join('/') + '/')}/
        </span>
      ))}
    </h1>
  );
}
