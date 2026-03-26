const express = require("express");
const Parser = require("rss-parser");
const path = require("path");

const app = express();
const parser = new Parser();
const PORT = process.env.PORT || 3000;

const WATER_KEYWORDS = [
  "물", "수질", "하천", "상수도", "하수도", "댐", "홍수", "가뭄",
  "저수지", "유역", "수자원", "water", "river", "flood", "drought",
  "watershed", "drinking water", "wastewater"
];

const CATEGORY_RULES = [
  { name: "수질", keywords: ["수질", "오염", "정화", "water quality", "pollution"] },
  { name: "하천", keywords: ["하천", "river", "유역", "지류"] },
  { name: "상수도", keywords: ["상수도", "수돗물", "drinking water", "정수"] },
  { name: "하수도", keywords: ["하수", "하수도", "wastewater", "sewage"] },
  { name: "홍수·가뭄", keywords: ["홍수", "가뭄", "flood", "drought", "침수"] }
];

const RSS_SOURCES = [
  "https://news.google.com/rss/search?q=%EB%AC%BC+OR+%EC%88%98%EC%A7%88+OR+%ED%95%98%EC%B2%9C+OR+%EC%83%81%EC%88%98%EB%8F%84+OR+%ED%95%98%EC%88%98%EB%8F%84+when:7d&hl=ko&gl=KR&ceid=KR:ko",
  "https://news.google.com/rss/search?q=%ED%99%8D%EC%88%98+OR+%EA%B0%80%EB%AD%84+OR+%EC%88%98%EC%9E%90%EC%9B%90+when:7d&hl=ko&gl=KR&ceid=KR:ko",
  "https://news.google.com/rss/search?q=water+OR+river+OR+drought+OR+flood+when:7d&hl=en-US&gl=US&ceid=US:en"
];

function stripHtml(text = "") {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isWithinDays(dateString, days = 7) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const diff = now.getTime() - date.getTime();

  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function containsWaterKeyword(text = "") {
  const lower = text.toLowerCase();
  return WATER_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function detectCategory(article) {
  const text = `${article.title} ${article.description}`.toLowerCase();

  const matched = CATEGORY_RULES.find((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword.toLowerCase()))
  );

  return matched ? matched.name : "기타 물이슈";
}

async function getWaterNews(days = 7, query = "") {
  const feeds = await Promise.all(RSS_SOURCES.map((url) => parser.parseURL(url)));

  const articles = feeds.flatMap((feed) =>
    (feed.items || []).map((item) => ({
      title: item.title || "제목 없음",
      link: item.link || "#",
      pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
      description: stripHtml(item.contentSnippet || item.content || item.summary || ""),
      source: feed.title || "RSS"
    }))
  );

  const searchTokens = String(query)
    .split(/OR|\||,/i)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const filtered = articles
    .filter((article) => containsWaterKeyword(`${article.title} ${article.description}`))
    .filter((article) => isWithinDays(article.pubDate, Number(days) || 7))
    .filter((article) => {
      if (searchTokens.length === 0) return true;

      const text = `${article.title} ${article.description}`.toLowerCase();
      return searchTokens.some((token) => text.includes(token));
    })
    .map((article) => ({
      ...article,
      category: detectCategory(article)
    }))
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  return Array.from(new Map(filtered.map((article) => [article.title, article])).values());
}

app.use(express.static(__dirname));

app.get("/api/news", async (req, res) => {
  try {
    const days = Math.max(1, Math.min(30, Number(req.query.days) || 7));
    const query = String(req.query.query || "");
    const articles = await getWaterNews(days, query);

    res.json({
      ok: true,
      total: articles.length,
      days,
      query,
      fetchedAt: new Date().toISOString(),
      articles
    });
  } catch (error) {
    console.error("API error:", error);

    res.status(500).json({
      ok: false,
      message: "뉴스를 불러오지 못했습니다.",
      error: error.message
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "running" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});