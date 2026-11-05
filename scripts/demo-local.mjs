import { spawn, spawnSync } from 'node:child_process';
import console from 'node:console';
import { access, appendFile, copyFile, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';
import process from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = join(root, '.env');
const localEnv = {
  ...process.env,
  DATABASE_URL: 'postgresql://notifyhub:notifyhub@127.0.0.1:5432/notifyhub',
};
const wait = (ms) => delay(ms);

function dockerReady() {
  const result = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 5000 });
  return !result.error && result.status === 0;
}

async function ensureDocker() {
  if (dockerReady()) return;

  if (process.platform !== 'darwin') {
    throw new Error('Docker no está disponible. Inicia Docker Desktop y vuelve a ejecutar pnpm demo:local.');
  }

  console.log('Docker Desktop no está listo; intentando abrirlo y esperando al daemon...');
  const launch = spawnSync('open', ['-a', 'Docker'], { stdio: 'ignore' });
  if (launch.error || launch.status !== 0) {
    throw new Error('No se pudo abrir Docker Desktop. Inícialo manualmente y vuelve a ejecutar el comando.');
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await wait(2000);
    if (dockerReady()) return;
  }
  throw new Error(
    'Docker Desktop no inició a tiempo. Ábrelo, espera a que esté listo y vuelve a intentarlo.',
  );
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, cwd = root, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} terminó ${signal ? `por ${signal}` : `con código ${code}`}`));
    });
  });
}

const storeVars = join(root, 'apps/demo-store/.dev.vars');

async function setup() {
  if (!(await exists(envFile))) {
    await copyFile(join(root, '.env.example'), envFile);
    console.log('Creado .env con los valores de desarrollo local.');
  }
  if (!(await exists(storeVars))) {
    await copyFile(join(root, 'apps/demo-store/.dev.vars.example'), storeVars);
  }
  // En local no hay credenciales de SendGrid/Twilio: el despachador usa los proveedores simulados.
  // Va en .dev.vars porque `--var` solo llega al primer Worker de `wrangler dev -c … -c …`.
  const dispatcherVars = join(root, 'apps/dispatcher/.dev.vars');
  const current = (await exists(dispatcherVars)) ? await readFile(dispatcherVars, 'utf8') : '';
  if (!/^SIMULATED_PROVIDERS=/m.test(current)) {
    await appendFile(
      dispatcherVars,
      `${current && !current.endsWith('\n') ? '\n' : ''}SIMULATED_PROVIDERS=true\n`,
    );
    console.log('apps/dispatcher/.dev.vars: SIMULATED_PROVIDERS=true (proveedores simulados en local).');
  }

  console.log('\n[1/4] Comprobando Docker e iniciando PostgreSQL local...');
  await ensureDocker();
  await run('docker', [
    'compose',
    '-f',
    'infra/compose.yaml',
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    '90',
    'postgres',
  ]);

  console.log('\n[2/4] Preparando los paquetes de persistencia...');
  await run('pnpm', ['--filter', '@notifyhub/persistence...', 'build'], root, localEnv);

  console.log('\n[3/4] Aplicando migraciones...');
  await run('pnpm', ['--filter', '@notifyhub/persistence', 'db:deploy'], root, localEnv);

  console.log('\n[4/4] Creando cliente local y catálogo de proveedores...');
  await run('pnpm', ['db:seed'], root, {
    ...localEnv,
    DEV_API_KEY: 'nh_dev_local_key',
  });
}

function startServers() {
  const children = [
    spawn(
      'pnpm',
      [
        'exec',
        'wrangler',
        'dev',
        '-c',
        'wrangler.jsonc',
        '-c',
        '../dispatcher/wrangler.jsonc',
        '--port',
        '8787',
        '--var',
        'PROVIDER_ADMIN_CLIENTS:*',
      ],
      { cwd: join(root, 'apps/api'), stdio: 'inherit' },
    ),
    spawn('pnpm', ['exec', 'wrangler', 'dev', '--port', '8790'], {
      cwd: join(root, 'apps/demo-store'),
      stdio: 'inherit',
    }),
    spawn('pnpm', ['--filter', '@notifyhub/console', 'dev'], {
      cwd: root,
      stdio: 'inherit',
    }),
  ];

  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    }
  };

  const finished = children.map(
    (child) =>
      new Promise((resolve) => {
        child.once('error', (error) => resolve({ code: 1, signal: null, error }));
        child.once('exit', (code, signal) => resolve({ code, signal }));
      }),
  );

  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  void Promise.race(finished).then((result) => {
    const code = result.code ?? (result.signal ? 1 : 0);
    if (result.error) console.error(`No se pudo iniciar un proceso local: ${result.error.message}`);
    stop('SIGTERM');
    process.exitCode = code;
  });

  return Promise.all(finished);
}

try {
  if (process.argv.includes('--help')) {
    console.log(
      'Uso: pnpm demo:local\nInicia PostgreSQL, aplica migraciones y seed, y levanta API, dispatcher, consola y la tienda de demostración.',
    );
    process.exit(0);
  }
  await setup();
  console.log('\nDemo lista. Usa la URL que anuncie Astro y conecta la API en http://localhost:8787.');
  console.log('Conecta la consola con nh_dev_local_key. Presiona Ctrl+C para detener los Workers.');
  console.log('Tienda de demostración (e-commerce conectado a NotifyHub): http://localhost:8790');
  await startServers();
} catch (error) {
  console.error(`\nNo se pudo iniciar la demo local: ${error.message}`);
  console.error('Comprueba que Docker Desktop esté iniciado y que pnpm install haya terminado.');
  process.exitCode = 1;
}
