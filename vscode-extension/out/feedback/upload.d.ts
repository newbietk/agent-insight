import { Storage } from '../storage/db';
export interface FeedbackForm {
    issueType: string;
    problemDescription: string;
    helpRequest: string;
    contactEmail: string;
}
export interface UploadResult {
    success: boolean;
    submissionId?: string;
    status?: string;
    error?: string;
}
/**
 * Upload session feedback to KirinAI Cloud.
 */
export declare function uploadFeedback(storage: Storage, sessionId: string, form: FeedbackForm, cloudUrl: string): Promise<UploadResult>;
//# sourceMappingURL=upload.d.ts.map