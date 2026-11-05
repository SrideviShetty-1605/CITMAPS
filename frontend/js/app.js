(function registerApp(app) {
  function syncViews() {
    app.ui.sync();
    app.threeScene?.updateHighlights();
    app.threeScene?.updateRoute();
    app.threeScene?.syncLabels();
  }

  function ensureRoute() {
    if (!app.state.selectedLocationId) {
      app.state.route = null;
      return;
    }

    app.state.route = app.navigation.buildRoute(app.state.startLocationId, app.state.selectedLocationId);
  }

  app.actions = {
    selectDestination(spaceId) {
      app.state.selectedLocationId = spaceId;
      ensureRoute();
      syncViews();
    },

    setStartLocation(spaceId) {
      app.state.startLocationId = spaceId;
      ensureRoute();
      syncViews();
    },

    routeToSelection() {
      ensureRoute();
      syncViews();
    },

    clearRoute() {
      app.state.selectedLocationId = null;
      app.state.route = null;
      syncViews();
    },

    toggleTheme() {
      const nextTheme = app.state.theme === "dark" ? "light" : "dark";
      app.utils.setTheme(nextTheme);
      app.threeScene?.applyTheme();
      syncViews();
    }
  };

  function showError(error) {
    const shell = document.querySelector(".app-shell");
    const isServerError = /Failed to load|Failed to fetch/i.test(error.message);

    if (!shell) {
      return;
    }

    shell.innerHTML = `
      <section class="panel-card" style="max-width: 720px; margin: 4rem auto;">
        <p class="eyebrow">Startup Error</p>
        <h1 style="margin-top: 0.5rem;">CITmaps could not start</h1>
        <p class="lead">${app.utils.escapeHtml(error.message)}</p>
        <p class="lead">${
          isServerError
            ? "Launch the frontend through a local server such as <code>python -m http.server</code> from the <code>frontend</code> folder, then open the served URL in your browser."
            : "Refresh the page after saving your changes. If the 3D scene is unavailable, confirm that the local Three.js file is loading correctly."
        }</p>
      </section>
    `;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await app.loadData();
      app.ui.initialize();
      app.threeScene?.initialize();
      syncViews();
    } catch (error) {
      console.error(error);
      showError(error);
    }
  });
})(window.CITmaps);
