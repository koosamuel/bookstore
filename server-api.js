(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BingoServerApi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const missingFunction = (error) => {
    const message = String(error?.message || error?.details || "");
    return error?.code === "PGRST202" || /function .* does not exist|schema cache/i.test(message);
  };

  const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

  function normalizeHomeFeed(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    return {
      generatedAt: source.generated_at || null,
      rankings: Array.isArray(source.rankings) ? source.rankings.map((item) => ({
        bookId: String(item.book_id || ""),
        title: String(item.title || "작품"),
        coverUrl: item.cover_url || null,
        uniqueViews: safeNumber(item.unique_views),
        completions: safeNumber(item.completions),
        approvedCheers: safeNumber(item.approved_cheers),
        rankingScore: safeNumber(item.ranking_score),
      })).filter((item) => item.bookId) : [],
    };
  }

  function normalizeAuthorDashboard(payload, authorAlias) {
    const source = payload && typeof payload === "object" ? payload : {};
    const works = Array.isArray(source.works) ? source.works.map((item) => ({
      bookId: String(item.book_id || ""),
      title: String(item.title || "작품"),
      coverUrl: item.cover_url || null,
      emoji: item.emoji || "📖",
      publicationStatus: String(item.publication_status || "draft"),
      uniqueViews: safeNumber(item.unique_views),
      completions: safeNumber(item.completions),
      approvedCheers: safeNumber(item.approved_cheers),
    })).filter((item) => item.bookId) : [];
    const cheers = Array.isArray(source.cheers) ? source.cheers.map((item) => ({
      id: String(item.id || ""),
      bookId: String(item.book_id || ""),
      title: String(item.title || "작품"),
      body: String(item.body || ""),
      createdAt: item.created_at || null,
    })).filter((item) => item.id && item.body) : [];
    return {
      authorAlias: String(source.author_alias || authorAlias || ""),
      generatedAt: source.generated_at || null,
      works,
      cheers,
      summary: {
        published: works.filter((item) => item.publicationStatus === "published").length,
        drafts: works.filter((item) => item.publicationStatus !== "published").length,
        cheers: cheers.length,
      },
    };
  }

  // Server fields are authoritative; demos only fill missing presentation fields.
  function normalizeBook(record, demo) {
    const book = { ...record };
    if (!demo || book.data_origin === "actual") return book;
    const defaults = {
      title: demo.title, author: demo.author, description: demo.description,
      grade: demo.grade, cover_url: `./assets/web/synthetic/${demo.slug}/cover.jpg`,
    };
    for (const [field, fallback] of Object.entries(defaults)) {
      if (book[field] == null || book[field] === "") book[field] = fallback;
    }
    return book;
  }

  function create(client) {
    if (!client?.rpc) throw new Error("Supabase client is required");
    return {
      async getHomeFeed() {
        const { data, error } = await client.rpc("get_public_home_feed");
        if (error) {
          if (missingFunction(error)) return null;
          throw error;
        }
        return normalizeHomeFeed(data);
      },
      async getAuthorDashboard(authorAlias) {
        const alias = String(authorAlias || "").trim();
        if (!alias || alias.length > 100) throw new Error("올바른 작가 별칭을 선택해 주세요.");
        const { data, error } = await client.rpc("get_author_dashboard", { p_author_alias: alias });
        if (error) {
          if (missingFunction(error)) return null;
          throw error;
        }
        return normalizeAuthorDashboard(data, alias);
      },
    };
  }

  return { create, missingFunction, normalizeBook, normalizeHomeFeed, normalizeAuthorDashboard };
});
