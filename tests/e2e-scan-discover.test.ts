// Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
// This program is free software, you can redistribute it and/or modify it under the terms and conditions of
// CANN Open Software License Agreement Version 2.0 (the "License").
// Please refer to the License for details. You may not use this file except in compliance with the License.
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
// See LICENSE in the root of the software repository for the full text of the License.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scanAgent, loadAgentSessions } from '../src/lib/discovery.ts';
import { importSession } from '../src/lib/ingest/data-service.ts';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const FIXTURE_DIR = path.resolve(__dirname, 'data/e2e');
const OPENCODE_DB = path.join(FIXTURE_DIR, 'opencode-sample.db');
const OPENCODE_SQL = path.join(FIXTURE_DIR, 'opencode-sample.sql');

// Rebuild fixture DB from SQL dump if missing (OAT: no binary files in repo)
if (!fs.existsSync(OPENCODE_DB) && fs.existsSync(OPENCODE_SQL)) {
  const db = new DatabaseSync(OPENCODE_DB);
  db.exec(fs.readFileSync(OPENCODE_SQL, 'utf8'));
  db.close();
}

const prisma = new PrismaClient();

describe('E2E: scan → discover → import pipeline', () => {
  const importedSessionIds: string[] = [];

  afterAll(async () => {
    for (const sid of importedSessionIds) {
      try {
        await prisma.session.deleteMany({ where: { taskId: sid } });
      } catch { /* ignore */ }
    }
    await prisma.$disconnect();
  });

  describe('discovery: scanAgent with fixture DB', () => {
    it('scanAgent finds sessions in fixture opencode DB', () => {
      const result = scanAgent('opencode', OPENCODE_DB);
      expect(result.found).toBe(true);
      expect(result.sessionCount).toBeGreaterThan(0);
      expect(result.sourcePath).toBe(OPENCODE_DB);
      expect(result.id).toBe('opencode');
      expect(result.name).toBe('Opencode');
    });

    it('scanAgent returns not-found for bogus path', () => {
      const result = scanAgent('opencode', '/tmp/nonexistent-opencode-xyz.db');
      expect(result.found).toBe(false);
      expect(result.reason).toBe('path-not-found');
    });
  });

  describe('discovery: loadAgentSessions pagination', () => {
    it('returns paginated sessions from fixture DB', () => {
      const result = loadAgentSessions('opencode', OPENCODE_DB, 1, 10);
      expect(result.total).toBeGreaterThan(0);
      expect(result.sessions.length).toBeGreaterThan(0);
      expect(result.sessions.length).toBeLessThanOrEqual(10);

      // Session shape
      const s = result.sessions[0];
      expect(s.id).toBeTruthy();
      expect(typeof s.turnCount).toBe('number');
      expect(s.createdAt).toBeTruthy();
    });

    it('page 2 returns different sessions than page 1', () => {
      const page1 = loadAgentSessions('opencode', OPENCODE_DB, 1, 1);
      if (page1.total < 2) return; // skip if insufficient sessions

      const page2 = loadAgentSessions('opencode', OPENCODE_DB, 2, 1);
      expect(page2.sessions.length).toBeGreaterThan(0);
      expect(page2.sessions[0].id).not.toBe(page1.sessions[0].id);
    });

    it('excessive page returns empty sessions', () => {
      const result = loadAgentSessions('opencode', OPENCODE_DB, 999, 20);
      expect(Array.isArray(result.sessions)).toBe(true);
      expect(result.sessions.length).toBe(0);
      expect(result.total).toBeGreaterThan(0); // total still accurate
    });
  });

  describe('full pipeline: discover → import → verify in DB', () => {
    it('imports a discovered session through the data-service', async () => {
      const discovered = loadAgentSessions('opencode', OPENCODE_DB, 1, 1);
      if (discovered.sessions.length === 0) return;

      const sessionId = discovered.sessions[0].id;
      const result = await importSession(OPENCODE_DB, sessionId, prisma, OPENCODE_DB, 'opencode-db');

      if (result.imported) {
        importedSessionIds.push(sessionId);
      }

      // Verify in DB
      const dbSession = await prisma.session.findFirst({
        where: { taskId: sessionId, framework: 'opencode' },
      });
      expect(dbSession).not.toBeNull();
      expect(dbSession!.taskId).toBe(sessionId);
      expect(dbSession!.framework).toBe('opencode');
    });

    it('imported session has complete data (turns, tool calls)', async () => {
      if (importedSessionIds.length === 0) return;

      const session = await prisma.session.findFirst({
        where: { taskId: importedSessionIds[0], framework: 'opencode' },
      });
      expect(session).not.toBeNull();
      expect(session!.query).toBeTruthy();
      expect(session!.totalTokens).toBeGreaterThan(0);

      const turns = await prisma.turn.findMany({
        where: { sessionId: session!.id },
      });
      expect(turns.length).toBeGreaterThan(0);

      const toolCalls = await prisma.toolCall.findMany({
        where: { turn: { sessionId: session!.id } },
      });
      expect(toolCalls.length).toBeGreaterThan(0);
    });
  });
});
