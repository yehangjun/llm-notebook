export type FeedItem = {
  id: string;
  item_type: "note" | "aggregate";
  creator_kind: "user" | "source";
  creator_id: string;
  creator_name: string;
  source_url: string;
  source_domain: string;
  source_title: string | null;
  tags: string[];
  analysis_status: "pending" | "running" | "succeeded" | "failed";
  summary_excerpt: string | null;
  auto_summary_excerpt: string | null;
  note_body_excerpt: string | null;
  published_at: string | null;
  updated_at: string;
  like_count: number;
  bookmark_count: number;
  liked: boolean;
  bookmarked: boolean;
  following: boolean;
};

export type FeedListResponse = {
  items: FeedItem[];
};

export type CreatorProfile = {
  creator_kind: "user" | "source";
  creator_id: string;
  display_name: string;
  source_domain: string | null;
  homepage_url: string | null;
  follower_count: number;
  content_count: number;
  following: boolean;
  can_follow: boolean;
};

export type FeedDetailResponse = {
  item: FeedItem;
  summary_short_text: string | null;
  summary_long_text: string | null;
  summary_text: string | null;
  note_body_md: string | null;
  analysis_error: string | null;
  model_provider: string | null;
  model_name: string | null;
  model_version: string | null;
  analyzed_at: string | null;
};
