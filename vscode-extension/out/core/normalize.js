"use strict";
// Copyright (c) 2025-2026 Huawei Technologies Co., Ltd.
// This program is free software, you can redistribute it and/or modify it under the terms and conditions of
// CANN Open Software License Agreement Version 2.0 (the "License").
// Please refer to the License for details. You may not use this file except in compliance with the License.
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
// See LICENSE in the root of the software repository for the full text of the License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalize = normalize;
const branding_1 = require("./branding");
const DEFAULT_USAGE = {
    total: 0,
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    inputMessagesTokens: 0,
};
function isValidISO(timestamp) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(timestamp);
}
function normalizeClaudeJsonl(interactions) {
    return interactions.map((raw) => {
        const role = raw.role || 'unknown';
        const timestamp = raw.timestamp && isValidISO(raw.timestamp) ? raw.timestamp : new Date(0).toISOString();
        const timeInfo = raw.timeInfo && raw.timeInfo.created ? raw.timeInfo : { created: 0 };
        let usage = null;
        if (raw.usage) {
            usage = {
                total: raw.usage.total ?? DEFAULT_USAGE.total,
                input: raw.usage.input ?? DEFAULT_USAGE.input,
                output: raw.usage.output ?? DEFAULT_USAGE.output,
                reasoning: raw.usage.reasoning ?? DEFAULT_USAGE.reasoning,
                cacheRead: raw.usage.cacheRead ?? DEFAULT_USAGE.cacheRead,
                cacheWrite: raw.usage.cacheWrite ?? DEFAULT_USAGE.cacheWrite,
                cost: raw.usage.cost ?? DEFAULT_USAGE.cost,
                inputMessagesTokens: raw.usage.inputMessagesTokens ?? DEFAULT_USAGE.inputMessagesTokens,
            };
        }
        return {
            role,
            content: raw.content ?? null,
            timestamp,
            timeInfo,
            agent: raw.agent ?? null,
            subagent_name: raw.subagent_name ?? null,
            subagent_session_id: raw.subagent_session_id ?? null,
            subagent_type: raw.subagent_type ?? null,
            tool_calls: raw.tool_calls ?? null,
            usage,
            model: raw.model ?? null,
            modelID: raw.modelID ?? null,
            providerID: raw.providerID ?? null,
            latency: raw.latency ?? null,
            finish_reason: raw.finish_reason ?? null,
        };
    });
}
function normalizeOpencodeDb(interactions) {
    return interactions.map((raw) => {
        const role = raw.role || 'unknown';
        const timestamp = raw.timestamp && isValidISO(raw.timestamp) ? raw.timestamp : new Date(0).toISOString();
        const timeInfo = raw.timeInfo && raw.timeInfo.created ? raw.timeInfo : { created: 0 };
        let usage = null;
        if (raw.usage) {
            usage = {
                total: raw.usage.total ?? DEFAULT_USAGE.total,
                input: raw.usage.input ?? DEFAULT_USAGE.input,
                output: raw.usage.output ?? DEFAULT_USAGE.output,
                reasoning: raw.usage.reasoning ?? DEFAULT_USAGE.reasoning,
                cacheRead: raw.usage.cacheRead ?? DEFAULT_USAGE.cacheRead,
                cacheWrite: raw.usage.cacheWrite ?? DEFAULT_USAGE.cacheWrite,
                cost: raw.usage.cost ?? DEFAULT_USAGE.cost,
                inputMessagesTokens: raw.usage.inputMessagesTokens ?? DEFAULT_USAGE.inputMessagesTokens,
            };
        }
        return {
            role,
            content: raw.content ?? null,
            timestamp,
            timeInfo,
            agent: raw.agent ?? null,
            subagent_name: raw.subagent_name ?? null,
            subagent_session_id: raw.subagent_session_id ?? null,
            subagent_type: raw.subagent_type ?? null,
            tool_calls: raw.tool_calls ?? null,
            usage,
            model: raw.model ?? null,
            modelID: raw.modelID ?? null,
            providerID: raw.providerID ?? null,
            latency: raw.latency ?? null,
            finish_reason: raw.finish_reason ?? null,
        };
    });
}
function normalize(interactions, sourceType) {
    switch (sourceType) {
        case 'opencode-db':
            return normalizeOpencodeDb(interactions);
        case 'claude-jsonl':
            return normalizeClaudeJsonl(interactions);
        case branding_1.BRAND_SOURCE_TYPE:
            return normalizeOpencodeDb(interactions);
        default:
            throw new Error(`Unknown source type: "${sourceType}". Supported types: opencode-db, claude-jsonl, ${branding_1.BRAND_SOURCE_TYPE}`);
    }
}
//# sourceMappingURL=normalize.js.map