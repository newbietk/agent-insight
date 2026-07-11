// Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
// This program is free software, you can redistribute it and/or modify it under the terms and conditions of
// CANN Open Software License Agreement Version 2.0 (the "License").
// Please refer to the License for details. You may not use this file except in compliance with the License.
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
// See LICENSE in the root of the software repository for the full text of the License.

import { describe, it, expect } from 'vitest';
import {
  resolveDefaultPaths,
  scanAgent,
  scanAllAgents,
  loadAgentSessions,
} from '../src/lib/discovery.ts';
import os from 'node:os';

describe('discovery: resolveDefaultPaths', () => {
  it('returns empty for unknown agent', () => {
    expect(resolveDefaultPaths('unknown-agent')).toEqual([]);
  });

  it('returns array for opencode and resolved paths have no tildes', () => {
    const paths = resolveDefaultPaths('opencode');
    expect(Array.isArray(paths)).toBe(true);
    for (const p of paths) {
      expect(p).not.toContain('~');
    }
  });

  it('returns resolved paths for claude-code on current platform', () => {
    const paths = resolveDefaultPaths('claude-code');
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p).not.toContain('~');
    }
  });

  it('resolves home directory tilde', () => {
    const paths = resolveDefaultPaths('claude-code');
    const home = os.homedir();
    for (const p of paths) {
      if (p) expect(p.startsWith(home)).toBe(true);
    }
  });
});

describe('discovery: scanAgent', () => {
  it('returns not-found for non-existent custom path', () => {
    const result = scanAgent('opencode', '/tmp/nonexistent-path-xyz123');
    expect(result.found).toBe(false);
    expect(result.reason).toBe('path-not-found');
  });

  it('returns unknown-agent for unrecognized agent', () => {
    const result = scanAgent('bogus-agent');
    expect(result.found).toBe(false);
    expect(result.reason).toBe('unknown-agent');
  });

  it('scans all known agents without throwing', () => {
    const results = scanAllAgents();
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(typeof r.found).toBe('boolean');
    }
  });
});

describe('discovery: loadAgentSessions', () => {
  it('returns empty for unknown agent', () => {
    const result = loadAgentSessions('unknown', '/some/path');
    expect(result.sessions).toEqual([]);
    expect(result.total).toBe(0);
  });
});
