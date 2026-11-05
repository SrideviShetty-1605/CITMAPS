(function bootstrapApp() {
  const storedTheme = localStorage.getItem("citmaps-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  window.CITmaps = {
    data: null,
    graph: null,
    refs: {},
    state: {
      theme: storedTheme || (prefersDark ? "dark" : "light"),
      selectedLocationId: null,
      startLocationId: null,
      route: null,
      zoom: 1,
      panX: 0,
      panY: 0
    },
    typeConfig: {
      classroom: {
        label: "Classroom",
        colorVar: "var(--type-classroom)",
        sceneColor: "#76a8d8"
      },
      lab: {
        label: "Laboratory",
        colorVar: "var(--type-lab)",
        sceneColor: "#63ba74"
      },
      faculty: {
        label: "Faculty Hall",
        colorVar: "var(--type-faculty)",
        sceneColor: "#d6a451"
      },
      office: {
        label: "Office",
        colorVar: "var(--type-office)",
        sceneColor: "#d5866d"
      },
      facility: {
        label: "Facility",
        colorVar: "var(--type-facility)",
        sceneColor: "#5fa9cf"
      },
      library: {
        label: "Library",
        colorVar: "var(--type-library)",
        sceneColor: "#c7a35f"
      },
      garden: {
        label: "Garden",
        colorVar: "var(--type-garden)",
        sceneColor: "#4ca760"
      },
      washroom: {
        label: "Washroom",
        colorVar: "var(--type-washroom)",
        sceneColor: "#63b5ba"
      },
      stairs: {
        label: "Stairs",
        colorVar: "var(--type-stairs)",
        sceneColor: "#8c9099"
      },
      lift: {
        label: "Lift",
        colorVar: "var(--type-lift)",
        sceneColor: "#8571d4"
      }
    }
  };

  const app = window.CITmaps;

  app.utils = {
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },

    distance(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.sqrt(dx * dx + dy * dy);
    },

    pixelsToMeters(distancePx) {
      return distancePx * 0.038;
    },

    metersToEta(distanceMeters) {
      return distanceMeters / 1.35;
    },

    formatDistance(distanceMeters) {
      if (distanceMeters < 1) {
        return "< 1 m";
      }

      return `${Math.round(distanceMeters)} m`;
    },

    formatDuration(seconds) {
      if (seconds < 30) {
        return "Under 30 sec";
      }

      const minutes = Math.max(1, Math.round(seconds / 60));
      return `${minutes} min walk`;
    },

    formatType(type) {
      return app.typeConfig[type]?.label || type;
    },

    getTypeColor(type) {
      return app.typeConfig[type]?.colorVar || "var(--type-facility)";
    },

    escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    },

    titleCase(value) {
      return value
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    },

    unique(values) {
      return [...new Set(values)];
    },

    getSpaceById(id) {
      return app.data?.spaceMap?.[id] || null;
    },

    getNodeById(id) {
      return app.graph?.nodeMap?.[id] || null;
    },

    getCorridorShapes(corridor) {
      if (corridor.shapes?.length) {
        return corridor.shapes;
      }

      return [
        {
          x: corridor.x,
          y: corridor.y,
          width: corridor.width,
          height: corridor.height,
          radius: corridor.radius
        }
      ];
    },

    getSpaceShapes(space) {
      if (space.shapes?.length) {
        return space.shapes;
      }

      return [
        {
          x: space.x,
          y: space.y,
          width: space.width,
          height: space.height,
          radius: space.radius
        }
      ];
    },

    setTheme(theme) {
      app.state.theme = theme;
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("citmaps-theme", theme);
    }
  };
})();
