(function registerSearch(app) {
  function getSearchBlob(space) {
    return [
      space.name,
      space.code,
      ...(space.keywords || []),
      app.utils.formatType(space.type)
    ]
      .join(" ")
      .toLowerCase();
  }

  function scoreSpace(space, query) {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return 1;
    }

    const name = space.name.toLowerCase();
    const code = String(space.code || "").toLowerCase();
    const blob = getSearchBlob(space);
    let score = 0;

    if (name === normalizedQuery || code === normalizedQuery) {
      score += 120;
    }

    if (name.startsWith(normalizedQuery)) {
      score += 45;
    }

    if (code.startsWith(normalizedQuery)) {
      score += 30;
    }

    if (blob.includes(normalizedQuery)) {
      score += 24;
    }

    normalizedQuery.split(/\s+/).forEach((part) => {
      if (part && blob.includes(part)) {
        score += 8;
      }
    });

    return score;
  }

  function getFeaturedSpaces() {
    const featuredIds = app.data.meta.featuredDestinations || [];
    return featuredIds
      .map((id) => app.utils.getSpaceById(id))
      .filter(Boolean);
  }

  function searchLocations(query) {
    if (!query.trim()) {
      return getFeaturedSpaces();
    }

    return app.data.spaces
      .map((space) => ({
        space,
        score: scoreSpace(space, query)
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.space.name.localeCompare(right.space.name))
      .slice(0, 10)
      .map((entry) => entry.space);
  }

  app.search = {
    searchLocations,
    getFeaturedSpaces
  };
})(window.CITmaps);
