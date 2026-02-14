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

