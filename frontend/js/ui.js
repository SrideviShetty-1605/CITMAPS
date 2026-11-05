(function registerUi(app) {
  let currentResults = [];
  let currentQuery = "";

  function getElement(id) {
    return document.getElementById(id);
  }

  function sortSpacesForSelect() {
    return [...app.data.spaces].sort((left, right) => left.name.localeCompare(right.name));
  }

  function renderLegend() {
    const legend = getElement("legend");

    if (!legend) {
      return;
    }

    const usedTypes = app.utils.unique(app.data.spaces.map((space) => space.type));

    legend.innerHTML = usedTypes
      .map((type) => {
        const label = app.utils.formatType(type);
        const color = app.utils.getTypeColor(type);
        return `
          <div class="legend-item">
            <span class="legend-swatch" style="background: ${color};"></span>
            <div>
              <strong>${app.utils.escapeHtml(label)}</strong>
              <span>${app.utils.escapeHtml(app.typeConfig[type]?.label || label)}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function populateStartSelect() {
    const startSelect = getElement("startSelect");

    if (!startSelect) {
      return;
    }

    startSelect.innerHTML = sortSpacesForSelect()
      .map((space) => {
        const selected = space.id === app.state.startLocationId ? " selected" : "";
        return `<option value="${space.id}"${selected}>${app.utils.escapeHtml(space.name)}</option>`;
      })
      .join("");
  }

  function renderSelectedCard() {
    const selected = app.utils.getSpaceById(app.state.selectedLocationId);
    const container = getElement("selectedLocation");

    if (!container) {
      return;
    }

    if (!selected) {
      container.innerHTML = `
        <p class="selected-overline">Destination</p>
        <h3>Select a space to begin</h3>
        <p>Search or select a room to highlight it in 3D and generate a route.</p>
      `;
      return;
    }

    container.innerHTML = `
      <p class="selected-overline">${app.utils.escapeHtml(app.utils.formatType(selected.type))}</p>
      <h3>${app.utils.escapeHtml(selected.name)}</h3>
      <p>${app.utils.escapeHtml(selected.description)}</p>
    `;
  }

  function renderRouteMetrics() {
    const route = app.state.route;
    const container = getElement("routeMetrics");

    if (!container) {
      return;
    }

    if (!route) {
      container.innerHTML = `
        <div class="metric-card">
          <strong>0 m</strong>
          <span>Route distance</span>
        </div>
        <div class="metric-card">
          <strong>0 min</strong>
          <span>Estimated time</span>
        </div>
        <div class="metric-card">
          <strong>0 hops</strong>
          <span>Graph nodes</span>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="metric-card">
        <strong>${app.utils.escapeHtml(app.utils.formatDistance(route.distanceMeters))}</strong>
        <span>Route distance</span>
      </div>
      <div class="metric-card">
        <strong>${app.utils.escapeHtml(app.utils.formatDuration(route.etaSeconds))}</strong>
        <span>Estimated time</span>
      </div>
      <div class="metric-card">
        <strong>${route.nodeIds.length}</strong>
        <span>Visited nodes</span>
      </div>
    `;
  }

  function renderRouteSteps() {
    const route = app.state.route;
    const container = getElement("routeSteps");

    if (!container) {
      return;
    }

    if (!route) {
      container.innerHTML = `
        <div class="empty-state">The route summary will appear here after you choose a destination.</div>
      `;
      return;
    }

    container.innerHTML = route.steps
      .map(
        (step, index) => `
          <div class="step-card">
            <span class="step-number">${index + 1}</span>
            <p>${app.utils.escapeHtml(step)}</p>
          </div>
        `
      )
      .join("");
  }

  function renderStats() {
    const statSpaces = getElement("statSpaces");
    const statNodes = getElement("statNodes");
    const statPath = getElement("statPath");

    if (statSpaces) {
      statSpaces.textContent = app.data.spaces.length;
    }

    if (statNodes) {
      statNodes.textContent = app.graph.nodes.length;
    }

    if (statPath) {
      statPath.textContent = app.state.route
        ? app.utils.formatDistance(app.state.route.distanceMeters)
        : "0 m";
    }
  }

  function renderResults(results, query = "") {
    currentResults = results;
    currentQuery = query;
    const resultsList = getElement("resultsList");
    const searchMeta = getElement("searchMeta");

    if (!resultsList || !searchMeta) {
      return;
    }

    if (!results.length) {
      resultsList.innerHTML = `<div class="empty-state">No spaces matched "${app.utils.escapeHtml(query)}".</div>`;
      searchMeta.textContent = "No matching destinations found on this floor.";
      return;
    }

    searchMeta.textContent = query
      ? `${results.length} matching destination${results.length > 1 ? "s" : ""} found.`
      : "Featured destinations for the ground floor.";

    resultsList.innerHTML = results
      .map((space) => {
        const isActive = app.state.selectedLocationId === space.id ? " is-active" : "";
        return `
          <article class="result-card${isActive}" data-space-id="${space.id}">
            <h3>${app.utils.escapeHtml(space.name)}</h3>
            <p>${app.utils.escapeHtml(space.description)}</p>
            <div class="result-tags">
              <span class="result-tag">${app.utils.escapeHtml(space.code)}</span>
              <span class="result-tag">${app.utils.escapeHtml(app.utils.formatType(space.type))}</span>
            </div>
          </article>
        `;
      })
      .join("");

    resultsList.querySelectorAll("[data-space-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const selectedSpace = app.utils.getSpaceById(card.dataset.spaceId);
        saveCommittedSearch(currentQuery || selectedSpace?.name || "");
        app.actions.selectDestination(card.dataset.spaceId);
      });
    });
  }

  function saveCommittedSearch(searchText) {
    const normalized = String(searchText || "").replace(/\s+/g, " ").trim();

    if (normalized) {
      void app.searchHistory?.saveSearch(normalized);
    }
  }

  function performSearch(query, options = {}) {
    const searchInput = getElement("searchInput");
    const normalized = String(query || "").replace(/\s+/g, " ").trim();

    if (searchInput) {
      searchInput.value = normalized;
    }

    renderResults(app.search.searchLocations(normalized), normalized);

    if (options.save !== false) {
      saveCommittedSearch(normalized);
    }
  }

  function renderThemeButton() {
    const themeButton = getElement("themeToggle");

    if (!themeButton) {
      return;
    }

    themeButton.textContent = app.state.theme === "dark" ? "Light Theme" : "Dark Theme";
  }

  function sync() {
    const startSelect = getElement("startSelect");
    const routeButton = getElement("routeToSelection");

    if (startSelect) {
      startSelect.value = app.state.startLocationId;
    }

    renderSelectedCard();
    renderRouteMetrics();
    renderRouteSteps();
    renderStats();
    renderThemeButton();
    renderResults(currentQuery ? currentResults : app.search.getFeaturedSpaces(), currentQuery);

    if (routeButton) {
      routeButton.disabled = !app.state.selectedLocationId;
    }
  }

  function bindControls() {
    const searchInput = getElement("searchInput");
    const clearSearch = getElement("clearSearch");
    const startSelect = getElement("startSelect");
    const routeToSelection = getElement("routeToSelection");
    const resetRoute = getElement("resetRoute");
    const themeToggle = getElement("themeToggle");
    const focusScene = getElement("focusScene");

    if (!searchInput) {
      return;
    }

    searchInput.addEventListener("input", () => {
      renderResults(app.search.searchLocations(searchInput.value), searchInput.value.trim());
    });

    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();

      saveCommittedSearch(searchInput.value);

      if (currentResults[0]) {
        app.actions.selectDestination(currentResults[0].id);
      }
    });

    if (clearSearch) {
      clearSearch.addEventListener("click", () => {
        searchInput.value = "";
        renderResults(app.search.getFeaturedSpaces());
      });
    }

    if (startSelect) {
      startSelect.addEventListener("change", (event) => {
        app.actions.setStartLocation(event.target.value);
      });
    }

    if (routeToSelection) {
      routeToSelection.addEventListener("click", () => {
        if (!app.state.selectedLocationId) {
          return;
        }

        app.actions.routeToSelection();
      });
    }

    if (resetRoute) {
      resetRoute.addEventListener("click", () => {
        app.actions.clearRoute();
      });
    }

    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        app.actions.toggleTheme();
      });
    }

    if (focusScene) {
      focusScene.addEventListener("click", () => {
        app.threeScene?.refocus();
      });
    }
  }

  function initialize() {
    app.utils.setTheme(app.state.theme);
    populateStartSelect();
    renderLegend();
    bindControls();
    renderResults(app.search.getFeaturedSpaces());
    app.searchHistory?.initialize();
    sync();
  }

  app.ui = {
    initialize,
    sync,
    renderResults,
    performSearch
  };
})(window.CITmaps);
