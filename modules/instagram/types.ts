/**
 * Tipos e contratos de dados para o Módulo Instagram (Direct & Comment-to-DM).
 */

export type MatchMode = "exact" | "contains" | "any";

export interface InstagramPostAutomation {
  id: string;
  organization_id: string;
  channel_session_id: string;
  post_id: string;
  post_url?: string | null;
  post_caption?: string | null;
  trigger_keyword?: string | null;
  match_mode: MatchMode;
  public_reply_enabled: boolean;
  public_replies: string[];
  dm_message: string;
  kanban_stage_id?: string | null;
  tags?: string[];
  ai_agent_id?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InstagramCommentEvent {
  commentId: string;
  postId: string;
  text: string;
  from: {
    id: string; // IGSID
    username: string;
  };
  createdTime?: number;
}

export interface InstagramDirectEvent {
  mid: string;
  senderId: string;
  recipientId: string;
  timestamp: number;
  text?: string;
  attachments?: Array<{
    type: "image" | "video" | "audio" | "file" | "share" | "story_mention";
    url?: string;
  }>;
}

export interface MatchCommentRuleResult {
  matched: boolean;
  rule?: InstagramPostAutomation;
  publicReply?: string;
  dmMessage?: string;
}
