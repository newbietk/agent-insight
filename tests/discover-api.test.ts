// Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
// This program is free software, you can redistribute it and/or modify it under the terms and conditions of
// CANN Open Software License Agreement Version 2.0 (the "License").
// Please refer to the License for details. You may not use this file except in compliance with the License.
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
// See LICENSE in the root of the software repository for the full text of the License.

import { describe, it, expect } from 'vitest';

describe('POST /api/ingest/discover', () => {
  const BASE = 'http://localhost:21025';

  it('scan action returns agents array', async () => {
    const res = await fetch(`${BASE}/api/ingest/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scan' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.agents)).toBe(true);
    expect(data.agents.length).toBeGreaterThanOrEqual(2);

    for (const agent of data.agents) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(typeof agent.found).toBe('boolean');
      expect(typeof agent.sessionCount).toBe('number');
    }
  });

  it('scan with custom path returns single agent result', async () => {
    const res = await fetch(`${BASE}/api/ingest/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'scan',
        agentId: 'opencode',
        customPath: '/tmp/nonexistent-12345',
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.agents.length).toBe(1);
    expect(data.agents[0].found).toBe(false);
    expect(data.agents[0].reason).toBe('path-not-found');
  });

  it('load-sessions returns paginated results', async () => {
    const res = await fetch(`${BASE}/api/ingest/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'load-sessions',
        agentId: 'opencode',
        sourcePath: '/tmp/nonexistent-12345',
        page: 1,
        pageSize: 10,
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.total).toBe('number');
    expect(Array.isArray(data.sessions)).toBe(true);
  });

  it('load-sessions rejects missing fields', async () => {
    const res = await fetch(`${BASE}/api/ingest/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load-sessions' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown action', async () => {
    const res = await fetch(`${BASE}/api/ingest/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });
});
