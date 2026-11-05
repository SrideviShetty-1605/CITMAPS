(function registerSearchHistory(app) {
  const API = {
    save: "api/save_search.php",
    list: "api/get_recent_searches.php",
    clear: "api/clear_searches.php"
  };

  const state = {
    isAvailable: true,
    items: []
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function normalizeSearchText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 255);
  }

  async function requestJson(url, options = {}) {
    const headers = {
      Accept: "application/json",
      ...(options.headers || {})
    };

    const requestOptions = {
      credentials: "same-origin",
      ...options,
      headers
    };

    if (options.body && typeof options.body !== "string") {
      requestOptions.body = JSON.stringify(options.body);
      requestOptions.headers = {
        ...headers,
        "Content-Type": "application/json"
      };
    }

    const response = await fetch(url, requestOptions);
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error("Search history API is not returning JSON. Use Apache/XAMPP to run PHP endpoints.");
    }

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Search history request failed.");
    }

    return data;
  }

  function setContainerVisibility(hasItems) {
    const container = getElement("recentSearches");

    if (container) {
      container.hidden = !state.isAvailable || !hasItems;
    }
  }

  function renderRecentSearches(items = state.items) {
    const list = getElement("recentSearchesList");
    const clearButton = getElement("clearRecentSearches");

    if (!list) {
      return;
    }

    if (!state.isAvailable || !items.length) {
      list.innerHTML = "";
      setContainerVisibility(false);
      return;
    }

    setContainerVisibility(true);

    if (clearButton) {
      clearButton.disabled = false;
    }

    list.innerHTML = "";

    items.forEach((item) => {
      const searchText = normalizeSearchText(item.search_text);

      if (!searchText) {
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "recent-search-item";
      button.title = item.searched_at ? `Searched ${item.searched_at}` : "Run this search again";

      const icon = document.createElement("span");
      icon.className = "recent-search-icon";
      icon.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "recent-search-text";
      label.textContent = searchText;

      button.append(icon, label);
      button.addEventListener("click", () => {
        performRecentSearch(searchText);
      });

      list.appendChild(button);
    });
  }

  async function loadRecentSearches() {
    try {
      const data = await requestJson(API.list);
      state.isAvailable = true;
      state.items = Array.isArray(data.searches) ? data.searches : [];
      renderRecentSearches();
    } catch (error) {
      state.isAvailable = false;
      renderRecentSearches([]);
      console.info(error.message);
    }
  }

  async function saveSearch(searchText) {
    const normalized = normalizeSearchText(searchText);

    if (!normalized) {
      return;
    }

    try {
      await requestJson(API.save, {
        method: "POST",
        body: { search_text: normalized }
      });
      await loadRecentSearches();
    } catch (error) {
      state.isAvailable = false;
      renderRecentSearches([]);
      console.info(error.message);
    }
  }

  async function clearSearches() {
    const clearButton = getElement("clearRecentSearches");

    if (clearButton) {
      clearButton.disabled = true;
    }

    try {
      await requestJson(API.clear, {
        method: "POST",
        body: {}
      });
      state.items = [];
      renderRecentSearches([]);
    } catch (error) {
      console.info(error.message);
    } finally {
      if (clearButton) {
        clearButton.disabled = false;
      }
    }
  }

  function performRecentSearch(searchText) {
    const searchInput = getElement("searchInput");

    if (searchInput) {
      searchInput.value = searchText;
      searchInput.focus();
    }

    app.ui?.performSearch(searchText, { save: false });
    void saveSearch(searchText);
  }

  function bindControls() {
    const clearButton = getElement("clearRecentSearches");

    if (clearButton) {
      clearButton.addEventListener("click", () => {
        void clearSearches();
      });
    }
  }

  function initialize() {
    bindControls();
    void loadRecentSearches();
  }

  app.searchHistory = {
    initialize,
    loadRecentSearches,
    saveSearch,
    clearSearches,
    renderRecentSearches
  };
})(window.CITmaps);
