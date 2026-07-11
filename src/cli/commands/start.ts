// Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
// This program is free software, you can redistribute it and/or modify it under the terms and conditions of
// CANN Open Software License Agreement Version 2.0 (the "License").
// Please refer to the License for details. You may not use this file except in compliance with the License.
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
// See LICENSE in the root of the software repository for the full text of the License.

import { Command } from 'commander';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BRAND_NAME } from '@/lib/branding';

// Resolve package root from this file's location:
// src/cli/commands/start.ts → go up 4 levels to package root
const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = path.resolve(__filename, '..', '..', '..', '..');

function ensureEnv(port: string): void {
  const envPath = path.join(PACKAGE_ROOT, '.env');
  const dbPath = path.join(PACKAGE_ROOT, 'prisma', 'dev.db');

  // Write .env if missing
  if (!fs.existsSync(envPath)) {
    const content = [
      `DATABASE_URL="file:${dbPath.replace(/\\/g, '/')}"`,
      `PORT=${port}`,
    ].join('\n') + '\n';
    fs.writeFileSync(envPath, content);
    console.log(`[kirinai] Created .env at ${envPath}`);
  }
}

function ensureDatabase(): boolean {
  const dbPath = path.join(PACKAGE_ROOT, 'prisma', 'dev.db');
  if (fs.existsSync(dbPath)) {
    // Quick check: can we open it?
    try {
      const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      db.prepare('SELECT 1 FROM Session LIMIT 1').get();
      db.close();
      return true;
    } catch {
      console.log('[kirinai] Database exists but schema incomplete, recreating...');
      fs.unlinkSync(dbPath);
    }
  }

  console.log('[kirinai] Initializing database...');
  const result = spawnSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
    shell: true,
  });
  return result.status === 0;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    } else if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', url], { stdio: 'ignore', detached: true, shell: true }).unref();
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    }
  } catch { /* browser open is best-effort */ }
}

export function startCommand(): Command {
  const cmd = new Command('start');
  cmd
    .description('Start the KirinAI-Insight web server')
    .option('--port <port>', 'Server port', process.env.PORT || '21025')
    .option('--no-open', 'Do not open browser')
    .option('--fresh', 'Clear cache and rebuild')
    .action(async (opts) => {
      const port = opts.port;
      const url = `http://localhost:${port}`;

      // 1. Ensure .env
      ensureEnv(port);

      // 2. Prisma generate (ensure client is ready)
      console.log('[kirinai] Generating Prisma client...');
      spawnSync('npx', ['prisma', 'generate'], {
        cwd: PACKAGE_ROOT,
        stdio: 'pipe',
        shell: true,
      });

      // 3. Ensure database
      if (!ensureDatabase()) {
        console.error('[kirinai] Failed to initialize database.');
        process.exit(1);
      }

      // 4. Run next build if .next doesn't exist or --fresh flag
      const nextDir = path.join(PACKAGE_ROOT, '.next');
      if (opts.fresh || !fs.existsSync(nextDir)) {
        console.log('[kirinai] Building Next.js app (first run)...');
        const buildResult = spawnSync('npx', ['next', 'build'], {
          cwd: PACKAGE_ROOT,
          stdio: 'inherit',
          shell: true,
          env: { ...process.env, PORT: port },
        });
        if (buildResult.status !== 0) {
          console.error('[kirinai] Build failed. Try running: npm run build');
          process.exit(1);
        }
      }

      // 5. Start server
      console.log(`[kirinai] Starting ${BRAND_NAME} on ${url}`);
      console.log('[kirinai] Press Ctrl+C to stop');

      const server = spawn('npx', ['next', 'start', '--port', port], {
        cwd: PACKAGE_ROOT,
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, PORT: port },
      });

      // 6. Wait for server to be ready, then open browser
      if (opts.open) {
        let attempts = 0;
        const checkReady = setInterval(async () => {
          attempts++;
          try {
            const res = await fetch(`${url}/api/observe/data?pageSize=1`);
            if (res.ok) {
              clearInterval(checkReady);
              console.log(`[kirinai] Server ready — opening ${url}`);
              openBrowser(url);
            }
          } catch { /* not ready yet */ }
          if (attempts > 60) {
            clearInterval(checkReady);
            console.log(`[kirinai] Server taking longer than expected. Open ${url} manually.`);
          }
        }, 1000);
      }

      server.on('exit', (code) => process.exit(code ?? 0));

      // Forward signals
      process.on('SIGINT', () => { server.kill('SIGINT'); });
      process.on('SIGTERM', () => { server.kill('SIGTERM'); });
    });

  return cmd;
}
