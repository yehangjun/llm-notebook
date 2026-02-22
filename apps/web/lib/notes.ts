export type NoteSummaryPublic = {
  id: string;
  status: "succeeded" | "failed";
  source_language: string | null;
  title: string | null;
  published_at: string | null;
  summary_short_text: string | null;
  summary_long_text: string | null;
  summary_text: string | null;
  tags: string[];
  model_provider: string | null;
  model_name: string | null;
  model_version: string | null;
  analyzed_at: string;
  error_code: string | null;
  error_message: string | null;
};

export type NoteListItem = {
  id: string;
  source_url: string;
  source_domain: string;
  source_title: string | null;
  published_at: string | null;
  tags: string[];
  summary_excerpt: string | null;
  auto_summary_excerpt: string | null;
  note_body_excerpt: string | null;
  like_count: number;
  bookmark_count: number;
  visibility: "private" | "public";
  analysis_status: "pending" | "running" | "succeeded" | "failed";
  updated_at: string;
};

export type NoteDetail = {
  id: string;
  source_url: string;
  source_domain: string;
  source_title: string | null;
  tags: string[];
  note_body_md: string;
  visibility: "private" | "public";
  analysis_status: "pending" | "running" | "succeeded" | "failed";
  analysis_error: string | null;
  created_at: string;
  updated_at: string;
  latest_summary: NoteSummaryPublic | null;
};

export type PublicNoteDetail = {
  id: string;
  source_url: string;
  source_domain: string;
  source_title: string | null;
  tags: string[];
  note_body_md: string;
  analysis_status: "pending" | "running" | "succeeded" | "failed";
  created_at: string;
  updated_at: string;
  latest_summary: NoteSummaryPublic | null;
};

export type NoteListResponse = {
  notes: NoteListItem[];
};

export type CreateNoteResponse = {
  note: NoteDetail;
  created: boolean;
  message: string | null;
};
