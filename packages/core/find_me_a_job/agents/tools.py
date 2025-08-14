import asyncio

from crawl4ai import AsyncWebCrawler, CacheMode, CrawlerRunConfig


async def crawl4ai_scrape(url: str) -> dict:
    """
    Scrape URL using Crawl4AI for LLM-ready content.

    Returns clean markdown content optimized for AI processing.
    """
    config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,  # Always get fresh content
        word_count_threshold=50,  # Filter out short content blocks
        excluded_tags=[
            "nav",
            "footer",
            "header",
            "aside",
            "script",
            "style",
        ],  # Clean content
        exclude_external_links=True,  # Focus on main content
        wait_for="css:body",  # Ensure page is loaded
        page_timeout=30000,  # 30 second timeout
    )

    try:
        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url, config=config)

            if result.success:
                # Extract clean content - check available attributes
                content = (
                    getattr(result, "markdown", "")
                    or getattr(result, "cleaned_html", "")
                    or ""
                )
                title = getattr(result, "title", "Untitled") or "Untitled"

                # Truncate if too large (prevent database bloat)
                max_content_length = 100000  # 100k chars
                if len(content) > max_content_length:
                    content = (
                        content[:max_content_length] + "\n\n[Content truncated...]"
                    )

                return {
                    "url": url,
                    "text": content,
                    "title": title,
                    "success": True,
                    "word_count": len(content.split()),
                    "links": getattr(result, "links", {}),
                }
            else:
                return {
                    "url": url,
                    "error": result.error_message or "Unknown crawling error",
                    "success": False,
                }

    except Exception as e:
        return {"url": url, "error": f"Crawl4AI error: {e!s}", "success": False}


# Convenience function for testing
async def test_scraper():
    """Test the scraper with a simple URL."""
    # Test with a more reliable URL
    result = await crawl4ai_scrape("https://httpbin.org/html")
    print(f"Success: {result['success']}")
    if result["success"]:
        print(f"Title: {result['title']}")
        print(f"Content length: {len(result['text'])} chars")
        print(f"Word count: {result['word_count']}")
        print(f"Preview: {result['text'][:200]}...")
    else:
        print(f"Error: {result['error']}")


if __name__ == "__main__":
    asyncio.run(test_scraper())
