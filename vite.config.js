import { defineConfig, loadEnv } from 'vite';

// Serves api/*.js as Vercel-style (req, res) handlers during `npm run dev`,
// so local development needs no Vercel account or CLI.
function apiDevServer() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const name = (req.url || '/').split('?')[0].replace(/^\/+|\/+$/g, '');
        if (!/^[a-z0-9-]+$/i.test(name)) {
          res.statusCode = 404;
          return res.end('Not found');
        }
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`);
          req.body = await readJsonBody(req);
          await mod.default(req, res);
        } catch (err) {
          console.error(`[api/${name}]`, err);
          if (!res.headersSent) {
            res.statusCode = err.code === 'ERR_LOAD_URL' ? 404 : 500;
            res.end(JSON.stringify({ error: 'dev server error' }));
          }
        }
      });
    },
  };
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.method !== 'POST') return resolve(undefined);
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); }
    });
  });
}

export default defineConfig(({ command, mode }) => {
  // Load every var from .env / .env.local (not just VITE_*) into process.env
  // for the API handlers. These are never exposed to the browser bundle.
  // loadEnv prefers values already in process.env, so first reset process.env to
  // the shell's original environment; otherwise edits to .env.local would be
  // ignored after the first load (the dev server restarts in the same process).
  const shellEnv = (globalThis.__shellEnv ??= { ...process.env });
  for (const key of Object.keys(process.env)) {
    if (key in shellEnv) process.env[key] = shellEnv[key];
    else delete process.env[key];
  }
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  // Lets /api/tts accept free text for the voice test page. Never set in production.
  if (command === 'serve') process.env.APP_DEV_SERVER = '1';
  return { plugins: [apiDevServer()] };
});
