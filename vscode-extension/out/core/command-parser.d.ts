export interface CommandInfo {
    name: string;
    args: string;
    output: string | null;
}
export interface ContinuationInfo {
    /** First line of the summary, e.g. "Primary Request and Intent: ..." */
    summaryLine: string | null;
    /** Number of numbered sections in the summary */
    sectionCount: number;
    /** Full summary text */
    fullSummary: string;
}
export declare function isCommandTurn(text: string): boolean;
export declare function isCommandCaveat(text: string): boolean;
export declare function isCommandStdout(text: string): boolean;
export declare function isAnyCommandRelated(text: string): boolean;
export declare function isContinuationTurn(text: string): boolean;
export declare function parseCommandTurns(texts: string[]): CommandInfo;
export declare function formatCommandDisplay(info: CommandInfo): string;
export declare function parseContinuationTurn(text: string): ContinuationInfo;
//# sourceMappingURL=command-parser.d.ts.map