// Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
// This program is free software, you can redistribute it and/or modify it under the terms and conditions of
// CANN Open Software License Agreement Version 2.0 (the "License").
// Please refer to the License for details. You may not use this file except in compliance with the License.
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
// See LICENSE in the root of the software repository for the full text of the License.

import { NextRequest, NextResponse } from 'next/server';
import { scanAllAgents, scanAgentWithCustomPath, loadAgentSessions } from '@/lib/discovery';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, agentId, customPath, sourcePath, page, pageSize } = body;

    switch (action) {
      case 'scan': {
        if (agentId && customPath) {
          const result = scanAgentWithCustomPath(agentId, customPath);
          return NextResponse.json({ agents: [result] });
        }
        if (agentId) {
          const result = scanAgentWithCustomPath(agentId, customPath ?? '');
          return NextResponse.json({ agents: [result] });
        }
        const agents = scanAllAgents();
        return NextResponse.json({ agents });
      }

      case 'load-sessions': {
        if (!agentId || !sourcePath) {
          return NextResponse.json(
            { error: 'Missing required fields: agentId, sourcePath' },
            { status: 400 },
          );
        }
        const p = Math.max(1, Number(page ?? 1));
        const ps = Math.max(1, Math.min(100, Number(pageSize ?? 20)));
        const result = loadAgentSessions(agentId, sourcePath, p, ps);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: "${action}". Supported: scan, load-sessions` },
          { status: 400 },
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
