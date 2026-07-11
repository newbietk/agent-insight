// Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
// This program is free software, you can redistribute it and/or modify it under the terms and conditions of
// CANN Open Software License Agreement Version 2.0 (the "License").
// Please refer to the License for details. You may not use this file except in compliance with the License.
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
// See LICENSE in the root of the software repository for the full text of the License.

import { NextRequest, NextResponse } from 'next/server';
import { exportSession } from '@/lib/ingest/export-service';
import { prisma } from '@/lib/db';
import { VERSION } from '@/lib/version';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const CLOUD_URL = process.env.KIRINAI_CLOUD_URL || 'http://localhost:21026';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, framework, issueType, problemDescription, helpRequest, contactEmail } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
    }
    if (!issueType) {
      return NextResponse.json({ error: 'Missing issueType' }, { status: 400 });
    }
    if (!problemDescription) {
      return NextResponse.json({ error: 'Missing problemDescription' }, { status: 400 });
    }

    // Export session to SQLite
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const dbPath = path.join(os.tmpdir(), `upload_${randomSuffix}.db`);

    try {
      const filePath = await exportSession(taskId, dbPath, prisma, framework);
      const sessionBuffer = fs.readFileSync(filePath);
      const filename = `session_${taskId}_${randomSuffix}.db`;

      // Read session metadata
      const where: Record<string, string> = { taskId };
      if (framework) where.framework = framework;
      const session = await prisma.session.findFirst({ where });

      // Build multipart form data for cloud upload
      const formData = new FormData();
      formData.append('taskId', taskId);
      formData.append('issueType', issueType);
      formData.append('problemDescription', problemDescription);
      formData.append('helpRequest', helpRequest || '');
      if (contactEmail) formData.append('contactEmail', contactEmail);
      formData.append('framework', framework ?? 'unknown');
      formData.append('model', session?.model ?? '');
      formData.append('totalTokens', String(session?.totalTokens ?? 0));
      formData.append('totalCost', String(session?.totalCost ?? 0));
      formData.append('turnCount', String(session?.totalLlmCallCount ?? 0));
      formData.append('kirinaiVersion', VERSION);
      formData.append('sessionData', new Blob([sessionBuffer]), filename);

      // POST to KirinAI-Cloud
      const res = await fetch(`${CLOUD_URL}/api/submissions`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Cloud upload failed' }));
        return NextResponse.json({ error: err.error || `Cloud returned ${res.status}` }, { status: 502 });
      }

      const result = await res.json();
      return NextResponse.json({ success: true, submissionId: result.id, status: result.status });
    } finally {
      try { fs.unlinkSync(dbPath); } catch {}
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
