#!/usr/bin/env node
// Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
// This program is free software, you can redistribute it and/or modify it under the terms and conditions of
// CANN Open Software License Agreement Version 2.0 (the "License").
// Please refer to the License for details. You may not use this file except in compliance with the License.
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
// See LICENSE in the root of the software repository for the full text of the License.

// KirinAI-Insight CLI entry point — loads TypeScript CLI via tsx (ESM loader)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const cliPath = resolve(root, 'src', 'cli', 'index.ts');

const child = spawn(process.execPath, [
  '--import', 'tsx/esm',
  cliPath,
  ...process.argv.slice(2),
], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
