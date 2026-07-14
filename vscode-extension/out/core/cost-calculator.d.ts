import type { TokenUsage } from './types';
export interface ModelPricing {
    inputPricePerToken: number;
    outputPricePerToken: number;
    reasoningPricePerToken: number;
    cacheReadPricePerToken: number;
    cacheWritePricePerToken: number;
}
export declare const MODEL_PRICING: Record<string, ModelPricing>;
export declare function calculateCost(model: string, usage: TokenUsage): number;
export declare function calculateCostNullSafe(model: string | null, usage: TokenUsage | null): number;
//# sourceMappingURL=cost-calculator.d.ts.map