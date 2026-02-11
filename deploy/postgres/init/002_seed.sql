INSERT INTO sources (name, url, language)
VALUES
  ('OpenAI News', 'https://openai.com/news', 'en'),
  ('Hugging Face Blog', 'https://huggingface.co/blog', 'en'),
  ('机器之心', 'https://www.jiqizhixin.com', 'zh')
ON CONFLICT DO NOTHING;

INSERT INTO articles (source_id, title, summary, url, language, published_at)
SELECT s.id,
       'GPT engineering update',
       'Engineering notes for production LLM systems.',
       'https://example.com/openai/gpt-engineering-update',
       'en',
       NOW() - INTERVAL '2 day'
FROM sources s
WHERE s.name = 'OpenAI News'
  AND NOT EXISTS (
    SELECT 1 FROM articles WHERE url = 'https://example.com/openai/gpt-engineering-update'
  );

INSERT INTO articles (source_id, title, summary, url, language, published_at)
SELECT s.id,
       'RAG best practices',
       'Practical retrieval-augmented generation design checklist.',
       'https://example.com/hf/rag-best-practices',
       'en',
       NOW() - INTERVAL '1 day'
FROM sources s
WHERE s.name = 'Hugging Face Blog'
  AND NOT EXISTS (
    SELECT 1 FROM articles WHERE url = 'https://example.com/hf/rag-best-practices'
  );

INSERT INTO articles (source_id, title, summary, url, language, published_at)
SELECT s.id,
       'AI Coding 工具周报',
       '中文社区热点与工具进展摘要。',
       'https://example.com/jiqizhixin/ai-coding-weekly',
       'zh',
       NOW() - INTERVAL '12 hour'
FROM sources s
WHERE s.name = '机器之心'
  AND NOT EXISTS (
    SELECT 1 FROM articles WHERE url = 'https://example.com/jiqizhixin/ai-coding-weekly'
  );
