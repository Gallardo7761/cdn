import express from 'express';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

const ROOT = path.resolve(process.env.FILES_DIR ?? '/srv/files');
const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_GROUP = process.env.ADMIN_GROUP ?? 'lldap_admin';
const DEV_USER = process.env.DEV_USER;
const SEED_DIR = new URL('./seed/', import.meta.url).pathname;

// Versiones publicadas del theme (theme/1.2.3/...): nginx las sirve como immutable, así que no se tocan
const IMMUTABLE = /^theme\/\d+\.\d+\.\d+(\/|$)/;
// Ficheros que leen hub y dotme: se valida que sean JSON antes de guardarlos
const CONFIG = /^config\/.+\.json$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Protección contra path-traversal
function resolvePath(rel = '') {
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) throw new HttpError(400, 'Ruta fuera del CDN');
  return { abs, rel: path.relative(ROOT, abs) };
}

const pathParam = (req) => resolvePath(req.params.path?.join('/'));

const exists = (abs) => fs.access(abs).then(() => true, () => false);

async function assertMutable({ abs, rel }) {
  if (abs === ROOT) throw new HttpError(400, 'No se puede tocar la raíz del CDN');
  if (IMMUTABLE.test(rel) && await exists(abs)) {
    throw new HttpError(409, 'Las versiones publicadas del theme no se modifican; publica una versión nueva');
  }
}

// El cron del servidor genera un .sha256 junto a cada archivo; lo movemos/borramos con él
const sidecar = (abs) => `${abs}.sha256`;

function KID(req, res, next) {
  const user = DEV_USER ?? req.get('remote-user');
  const groups = DEV_USER ? [ADMIN_GROUP] : (req.get('remote-groups') ?? '').split(',').map((g) => g.trim());
  if (!user) return res.status(401).json({ error: 'Sin sesión de KID' });
  if (!groups.includes(ADMIN_GROUP)) return res.status(403).json({ error: `${user} no está en el grupo ${ADMIN_GROUP}` });
  req.user = user;
  next();
}

function sameOrigin(req, res, next) {
  const site = req.get('sec-fetch-site');
  if (req.method === 'GET' || req.method === 'HEAD' || !site || site === 'same-origin' || site === 'none') return next();
  res.status(403).json({ error: 'Petición desde otro origen' });
}

async function seedConfig() {
  for (const name of await fs.readdir(SEED_DIR)) {
    const target = path.join(ROOT, 'config', name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(SEED_DIR, name), target, fs.constants.COPYFILE_EXCL).then(
      () => console.log(`Creado config/${name} desde seed/`),
      (err) => { if (err.code !== 'EEXIST') throw err; },
    );
  }
}

const app = express();
app.disable('x-powered-by');
app.use(KID, sameOrigin);
app.use(express.static(new URL('./public/', import.meta.url).pathname));

app.get('/api/me', (req, res) => res.json({ user: req.user }));

// Listar una carpeta o descargar un archivo
app.get('/api/files{/*path}', async (req, res) => {
  const { abs } = pathParam(req);
  const stat = await fs.stat(abs);
  if (!stat.isDirectory()) return res.sendFile(abs, { dotfiles: 'allow' });

  const entries = await fs.readdir(abs, { withFileTypes: true });
  const items = await Promise.all(entries
    .filter((e) => !e.name.startsWith('.'))
    .map(async (e) => {
      const s = await fs.stat(path.join(abs, e.name));
      return { name: e.name, type: s.isDirectory() ? 'directory' : 'file', size: s.size, mtime: s.mtime };
    }));
  items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
  res.json(items);
});

// Subir o sobrescribir un archivo: el cuerpo de la petición es el contenido tal cual
app.put('/api/files/*path', async (req, res) => {
  const target = pathParam(req);
  await assertMutable(target);
  await fs.mkdir(path.dirname(target.abs), { recursive: true });

  // Se escribe a un temporal y se renombra al final, así nunca queda un archivo a medias
  const tmp = path.join(path.dirname(target.abs), `.${path.basename(target.abs)}.${randomUUID()}.part`);
  try {
    await pipeline(req, createWriteStream(tmp));
    if (CONFIG.test(target.rel)) JSON.parse(await fs.readFile(tmp, 'utf8'));
    await fs.rename(tmp, target.abs);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    if (err instanceof SyntaxError) throw new HttpError(400, `JSON inválido: ${err.message}`);
    throw err;
  }
  res.status(204).end();
});

app.post('/api/folders/*path', async (req, res) => {
  const target = pathParam(req);
  await assertMutable(target);
  await fs.mkdir(target.abs, { recursive: true });
  res.status(204).end();
});

app.post('/api/move', express.json(), async (req, res) => {
  const from = resolvePath(req.body.from);
  const to = resolvePath(req.body.to);
  await assertMutable(from);
  await assertMutable(to);
  await fs.stat(from.abs);
  if (await exists(to.abs)) throw new HttpError(409, `Ya existe ${to.rel}`);

  await fs.mkdir(path.dirname(to.abs), { recursive: true });
  await fs.rename(from.abs, to.abs);
  await fs.rename(sidecar(from.abs), sidecar(to.abs)).catch(() => {});
  res.status(204).end();
});

app.delete('/api/files/*path', async (req, res) => {
  const target = pathParam(req);
  await assertMutable(target);
  await fs.stat(target.abs);
  await fs.rm(target.abs, { recursive: true });
  await fs.rm(sidecar(target.abs), { force: true });
  res.status(204).end();
});

app.use((err, req, res, _next) => {
  if (err.code === 'ENOENT') return res.status(404).json({ error: 'No existe' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

if (DEV_USER) console.warn(`DEV_USER=${DEV_USER}: no se comprueba KID, todo el mundo es admin. Solo para desarrollo.`);
await seedConfig();
app.listen(PORT, () => console.log(`cdn-api escuchando en :${PORT}, sirviendo ${ROOT}`));
