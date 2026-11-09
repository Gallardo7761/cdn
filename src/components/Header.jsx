export default function Header({ search, onSearchChange, count }) {
  return (
    <kb-header site="cdn" tag={`archivos públicos · ${count} elementos`}>
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Buscar fichero…"
        aria-label="Buscar fichero"
        className="search"
      />
    </kb-header>
  );
}
