(() => {
  "use strict";

  const page = document.querySelector(".keyword-search");
  if (!page) return;
  const form = page.querySelector("form");
  const input = page.querySelector("#keyword-input");
  const status = page.querySelector("#keyword-status");
  const results = page.querySelector("#keyword-results");
  const retry = page.querySelector("#keyword-retry");
  let articles;
  let loading;
  let revision = 0;
  let composing = false;

  // 中文按子串匹配；英文忽略大小写，并兼容全角输入。
  const normalize = (text) => String(text || "").normalize("NFKC").toLowerCase();
  const termsFor = (query) => [...new Set(normalize(query).trim().split(/\s+/u).filter(Boolean))];

  async function loadArticles() {
    if (articles) return articles;
    if (!loading) {
      loading = (async () => {
        const response = await fetch(page.dataset.indexUrl, { cache: "no-cache" });
        if (!response.ok) throw new Error("Search index unavailable");
        const index = await response.json();
        if (!Array.isArray(index)) throw new Error("Invalid search index");
        articles = index.map((article) => ({
          ...article,
          searchable: normalize([article.title, article.summary, ...(article.tags || []), article.content].join("\n")),
        }));
        return articles;
      })();
    }
    const request = loading;
    try {
      return await request;
    } finally {
      // 失败后下次可重新获取；成功后复用已加载的索引。
      if (loading === request) loading = undefined;
    }
  }

  function excerpt(article, terms) {
    const content = String(article.content || "").replace(/\s+/gu, " ").trim();
    const overview = normalize([article.title, article.summary, ...(article.tags || [])].join("\n"));
    const bodyTerms = terms.filter((term) => !overview.includes(term));
    if (!bodyTerms.length && article.summary) return String(article.summary).slice(0, 150);
    const lower = content.toLowerCase();
    const positions = bodyTerms.map((term) => lower.indexOf(term)).filter((position) => position >= 0);
    if (!positions.length) return String(article.summary || content).slice(0, 150);
    const start = Math.max(0, Math.min(...positions) - 35);
    const end = start + 150;
    return `${start ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
  }

  function createResult(article, terms) {
    const result = document.createElement("article");
    result.className = "keyword-result";
    const title = document.createElement("h2");
    const link = document.createElement("a");
    link.href = article.permalink;
    link.textContent = article.title;
    title.append(link);
    const meta = document.createElement("p");
    meta.className = "keyword-result-meta";
    meta.textContent = [article.date, ...(article.tags || [])].filter(Boolean).join(" · ");
    const summary = document.createElement("p");
    summary.className = "keyword-result-excerpt";
    summary.textContent = excerpt(article, terms);
    result.append(title, meta, summary);
    return result;
  }

  function updateAddress(query) {
    const url = new URL(location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
  }

  async function search() {
    const current = ++revision;
    const query = input.value.trim();
    const terms = termsFor(query);
    updateAddress(query);
    results.replaceChildren();
    retry.hidden = true;
    if (!terms.length) {
      status.textContent = "输入关键词，查找相关文章。";
      return;
    }
    status.textContent = "正在搜索…";
    try {
      const index = await loadArticles();
      if (current !== revision) return;
      const matches = index.filter((article) => terms.every((term) => article.searchable.includes(term)));
      status.textContent = matches.length ? `找到 ${matches.length} 篇文章` : "没有找到匹配的文章，换个关键词试试。";
      const fragment = document.createDocumentFragment();
      for (const article of matches) fragment.append(createResult(article, terms));
      results.append(fragment);
    } catch {
      if (current !== revision) return;
      status.textContent = "搜索内容加载失败，请检查网络后重试。";
      retry.hidden = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!composing) search();
  });
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; search(); });
  input.addEventListener("input", (event) => {
    if (!composing && !event.isComposing) search();
  });
  retry.addEventListener("click", search);
  input.value = (new URLSearchParams(location.search).get("q") || "").slice(0, input.maxLength);
  if (input.value.trim()) search();
})();
