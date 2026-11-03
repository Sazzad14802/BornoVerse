/**
 * Moderation repository: reporting content (with optional evidence), the
 * owner's moderation notices and appeals.
 */

import { apiClient } from './client';
import { PickedFile, toFormData } from './upload';

export type ReportCategory =
  | 'sexual_content'
  | 'copyright'
  | 'plagiarism'
  | 'fake_account'
  | 'illegal'
  | 'harassment'
  | 'misleading'
  | 'other';

export type AppealReason = 'own_rights' | 'have_permission' | 'original_work' | 'report_mistaken' | 'other';

export interface ModerationAction {
  id: string;
  kind: 'notify' | 'hide' | 'restrict' | 'strike' | 'delete' | 'suspend' | string;
  details: { days?: number; total?: number; message?: string };
  created_at: string;
  reversed: boolean;
}

export interface ModerationCase {
  report_id: string;
  status: 'action_taken' | 'appealed' | 'resolved';
  violation: ReportCategory;
  audiobook: { id: string; title: string };
  actions: ModerationAction[];
  appeal_deadline: string | null;
  can_appeal: boolean;
  appeal: { id: string; status: 'pending' | 'accepted' | 'rejected'; reason: AppealReason; explanation: string; decision_note: string } | null;
  updated_at: string;
}

export interface ModerationStanding {
  strikes: number;
  publishing_restricted_until: string | null;
  cases: ModerationCase[];
}

/** One of the user's appeals, for the Appeals screen. */
export interface AppealRecord {
  id: string;
  report_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  reason: AppealReason;
  explanation: string;
  decision_note: string;
  created_at: string;
  decided_at: string | null;
  files: number;
  violation: ReportCategory | null;
  violation_label: string | null;
  case_status: string | null;
  audiobook: { id: string; title: string } | null;
}

export const moderationApi = {
  report(audiobookId: string, category: ReportCategory, details: string): Promise<{ id: string }> {
    return apiClient.post('/reports', { audiobook_id: audiobookId, category, details });
  },

  reportEvidence(reportId: string, file: PickedFile): Promise<unknown> {
    return apiClient.uploadFile(`/reports/${reportId}/evidence`, toFormData(file, 'application/pdf'));
  },

  standing(): Promise<ModerationStanding> {
    return apiClient.get<ModerationStanding>('/me/moderation');
  },

  appeals(): Promise<AppealRecord[]> {
    return apiClient.get<AppealRecord[]>('/me/appeals');
  },

  appeal(reportId: string, reason: AppealReason, explanation: string): Promise<{ id: string }> {
    return apiClient.post(`/moderation/cases/${reportId}/appeal`, { reason, explanation });
  },

  appealEvidence(appealId: string, file: PickedFile): Promise<unknown> {
    return apiClient.uploadFile(`/appeals/${appealId}/evidence`, toFormData(file, 'application/pdf'));
  },
};
