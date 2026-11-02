import { spawn } from 'node:child_process';
import console from 'node:console';
import { copyFile, access } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';
import process from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = join(root, '.env');
const localEnv = {
  ...process.env,
  DATABASE_URL: 'postgresql://notifyhub:notifyhub@127.0.0.1:5432/notifyhub',
};

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

async function setup() {
  if (!(await exists(envFile))) {
    await copyFile(join(root, '.env.example'), envFile);
    console.log('Creado .env con los valores de desarrollo local.');
  }

  console.log('\n[1/4] Iniciando PostgreSQL local...');
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
      'Uso: pnpm demo:local\nInicia PostgreSQL, aplica migraciones y seed, y levanta API, dispatcher y consola.',
    );
    process.exit(0);
  }
  await setup();
  console.log('\nDemo lista. Usa la URL que anuncie Astro y conecta la API en http://localhost:8787.');
  console.log('Conecta la consola con nh_dev_local_key. Presiona Ctrl+C para detener los Workers.');
  await startServers();
} catch (error) {
  console.error(`\nNo se pudo iniciar la demo local: ${error.message}`);
  console.error('Comprueba que Docker Desktop esté iniciado y que pnpm install haya terminado.');
  process.exitCode = 1;
}
