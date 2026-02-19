from types import SimpleNamespace
from unittest.mock import MagicMock

from app.core.config import settings
from app.services.aggregation_service import AggregationService


def _build_service() -> AggregationService:
    service = AggregationService.__new__(AggregationService)
    return service


def test_normalize_source_url_canonicalizes_host_port_and_tracking_query() -> None:
    service = _build_service()

    raw, normalized, host = service._normalize_source_url(
        "https://Example.com:443/post?a=1&utm_source=wechat&fbclid=xx"
    )

    assert raw == "https://Example.com:443/post?a=1&utm_source=wechat&fbclid=xx"
    assert host == "example.com"
    assert normalized == "https://example.com/post?a=1"


def test_normalize_source_url_rejects_private_network_host() -> None:
    service = _build_service()

    try:
        service._normalize_source_url("http://127.0.0.1/internal")
    except ValueError as exc:
        assert "不支持内网或本地链接" in str(exc)
        return

    raise AssertionError("expected ValueError for private/local host")


def test_collect_feed_entries_filters_invalid_urls_assets_and_duplicates(
    monkeypatch,
) -> None:
    service = _build_service()
    service._fetch_feed_xml = MagicMock(return_value="<rss></rss>")
    service._parse_feed_entries = MagicMock(
        return_value=[
            {"link": "javascript:alert(1)", "title": "skip-js", "published": None},
            {"link": "https://other.com/post", "title": "skip-domain", "published": None},
            {"link": "https://example.com/image.jpg", "title": "skip-asset", "published": None},
            {"link": "https://news.example.com/post?a=1&utm_source=rss", "title": "first", "published": None},
            {"link": "https://news.example.com/post?a=1", "title": "duplicate", "published": None},
            {"link": "https://blog.example.com/post2?x=2&fbclid=abc", "title": "second", "published": None},
        ]
    )
    monkeypatch.setattr(settings, "aggregation_max_items_per_source", 2)
    source = SimpleNamespace(source_domain="example.com", feed_url="https://example.com/feed.xml")

    entries = service._collect_feed_entries(source)

    assert len(entries) == 2
    assert entries[0].source_url == "https://news.example.com/post?a=1"
    assert entries[1].source_url == "https://blog.example.com/post2?x=2"
    assert entries[0].source_title == "first"
    assert entries[1].source_title == "second"
