(function registerMap(app) {
  const interaction = {
    isDragging: false,
    moved: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originPanX: 0,
    originPanY: 0,
    animationFrame: null
  };

  function markMapInteraction() {
    app.state.hasMapInteracted = true;
    updateOverlayText();
  }

  function buildSpaceLabel(space) {
    if (!space.showMapLabel) {
      return "";
    }

    const x = space.labelX ?? space.x + space.width / 2;
    const y = space.labelY ?? space.y + space.height / 2;
    const labelClass = space.width < 110 || space.height < 110 ? "label is-small" : "label";

    return `
      <text class="${labelClass}" x="${x}" y="${y}">
        ${app.utils.escapeHtml(space.name)}
      </text>
    `;
  }

  function buildBackground() {
    const { width, height } = app.data.meta.viewBox;
    return `
      <image
        class="floor-plan-image"
        href="${app.utils.escapeHtml(app.data.meta.floorPlanImage)}"
        x="0"
        y="0"
        width="${width}"
        height="${height}"
        preserveAspectRatio="xMidYMid meet"
      ></image>
    `;
  }

  function buildCorridors() {
    return app.data.corridors
      .map((corridor) =>
        app.utils
          .getCorridorShapes(corridor)
          .map(
            (shape) => `
              <rect
                class="corridor corridor-${corridor.id}"
                x="${shape.x}"
                y="${shape.y}"
                width="${shape.width}"
                height="${shape.height}"
                rx="${shape.radius || 8}"
                ry="${shape.radius || 8}"
                data-corridor-id="${corridor.id}"
              ></rect>
            `
          )
          .join("")
      )
      .join("");
  }

  function buildSpaces() {
    return app.data.spaces
      .map((space) => {
        const isSelected = app.state.selectedLocationId === space.id ? " is-selected" : "";
        const isStart = app.state.startLocationId === space.id ? " is-start" : "";

        return `
          <g class="space-group" data-space-id="${space.id}">
            <rect
              class="space${isSelected}${isStart}"
              x="${space.x}"
              y="${space.y}"
              width="${space.width}"
              height="${space.height}"
              rx="${space.radius || 8}"
              ry="${space.radius || 8}"
              style="fill: ${app.utils.getTypeColor(space.type)};"
            ></rect>
            ${buildSpaceLabel(space)}
          </g>
        `;
      })
      .join("");
  }

  function buildBadges() {
    const selectedSpace = app.utils.getSpaceById(app.state.selectedLocationId);
    const startSpace = app.utils.getSpaceById(app.state.startLocationId);
    const parts = [];

    if (startSpace) {
      const x = (startSpace.badgeX ?? startSpace.x + startSpace.width / 2);
      const y = (startSpace.badgeY ?? Math.max(36, startSpace.y - 18));
      parts.push(`
        <g class="map-badge map-badge-start">
          <rect x="${x - 66}" y="${y - 18}" width="132" height="34" rx="17" ry="17"></rect>
          <text x="${x}" y="${y + 4}">YOU ARE HERE</text>
        </g>
      `);
    }

    if (selectedSpace) {
      const x = (selectedSpace.badgeX ?? selectedSpace.x + selectedSpace.width / 2);
      const y = (selectedSpace.badgeY ?? Math.max(44, selectedSpace.y - 20));
      parts.push(`
        <g class="map-badge map-badge-destination">
          <rect x="${x - 88}" y="${y - 18}" width="176" height="34" rx="17" ry="17"></rect>
          <text x="${x}" y="${y + 4}">${app.utils.escapeHtml(selectedSpace.name)}</text>
        </g>
      `);
    }

    return parts.join("");
  }

  function buildRouteMarkup() {
    const route = app.state.route;
    const parts = [];

    if (route?.points?.length) {
      const points = route.points.map((point) => `${point.x},${point.y}`).join(" ");
      parts.push(`<polyline class="route-line" points="${points}"></polyline>`);
      parts.push(`<polyline class="route-guide" points="${points}"></polyline>`);

      route.points.forEach((point, index) => {
        const radius = index === 0 || index === route.points.length - 1 ? 9 : 6;
        parts.push(`<circle class="route-node" cx="${point.x}" cy="${point.y}" r="${radius}"></circle>`);
      });

      const firstPoint = route.points[0];
      parts.push(`<circle id="navigatorDot" class="navigator-dot" cx="${firstPoint.x}" cy="${firstPoint.y}" r="10"></circle>`);
    }

    return parts.join("");
  }

  function buildMapSvg() {
    const viewBox = app.data.meta.viewBox;

    return `
      ${buildBackground()}
      ${buildCorridors()}
      ${buildSpaces()}
      ${buildRouteMarkup()}
      ${buildBadges()}
    `;
  }

  function updateOverlayText() {
    const overlay = app.refs.mapOverlay;
    const selected = app.utils.getSpaceById(app.state.selectedLocationId);

    if (app.state.route && selected) {
      overlay.textContent = `${selected.name} routed from ${app.state.route.startSpace.name}.`;
      return;
    }

    if (selected) {
      overlay.textContent = `${selected.name} selected. Click Route To Selected to confirm the path.`;
      return;
    }

    overlay.textContent = app.state.hasMapInteracted
      ? "Floor 0 aligned to the uploaded plan."
      : "Wheel to zoom. Drag to pan. Click a highlighted room or facility to route there.";
  }

  function animateNavigator() {
    if (interaction.animationFrame) {
      cancelAnimationFrame(interaction.animationFrame);
      interaction.animationFrame = null;
    }

    const dot = document.getElementById("navigatorDot");
    const route = app.state.route;

    if (!dot || !route || route.points.length < 2) {
      return;
    }

    const segments = route.points.slice(1).map((point, index) => ({
      from: route.points[index],
      to: point,
      length: app.utils.distance(route.points[index], point)
    }));
    const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
    const duration = Math.max(2600, totalLength * 6.5);
    let start = null;

    function frame(timestamp) {
      if (start === null) {
        start = timestamp;
      }

      const elapsed = (timestamp - start) % duration;
      const travel = (elapsed / duration) * totalLength;
      let covered = 0;
      let currentPoint = route.points[0];

      for (const segment of segments) {
        if (covered + segment.length >= travel) {
          const ratio = (travel - covered) / segment.length;
          currentPoint = {
            x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
            y: segment.from.y + (segment.to.y - segment.from.y) * ratio
          };
          break;
        }

        covered += segment.length;
      }

      dot.setAttribute("cx", currentPoint.x);
      dot.setAttribute("cy", currentPoint.y);
      interaction.animationFrame = requestAnimationFrame(frame);
    }

    interaction.animationFrame = requestAnimationFrame(frame);
  }

  function bindSpaceClicks() {
    app.refs.floorMap.querySelectorAll("[data-space-id]").forEach((node) => {
      node.addEventListener("click", () => {
        if (interaction.moved) {
          return;
        }

        markMapInteraction();
        app.actions.selectDestination(node.dataset.spaceId);
      });
    });
  }

  function applyTransform() {
    app.refs.floorMap.style.transform = `translate(${app.state.panX}px, ${app.state.panY}px) scale(${app.state.zoom})`;
  }

  function setZoom(nextZoom) {
    app.state.zoom = app.utils.clamp(nextZoom, 0.7, 3.2);
    applyTransform();
  }

  function resetView() {
    app.state.zoom = 1;
    app.state.panX = 0;
    app.state.panY = 0;
    applyTransform();
    updateOverlayText();
  }

  function bindPanAndZoom() {
    const stage = app.refs.mapStage;

    stage.addEventListener("pointerdown", (event) => {
      interaction.isDragging = true;
      interaction.moved = false;
      interaction.pointerId = event.pointerId;
      interaction.startX = event.clientX;
      interaction.startY = event.clientY;
      interaction.originPanX = app.state.panX;
      interaction.originPanY = app.state.panY;
      stage.classList.add("is-dragging");
      stage.setPointerCapture(event.pointerId);
    });

    stage.addEventListener("pointermove", (event) => {
      if (!interaction.isDragging) {
        return;
      }

      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        interaction.moved = true;
        markMapInteraction();
      }

      app.state.panX = interaction.originPanX + deltaX;
      app.state.panY = interaction.originPanY + deltaY;
      applyTransform();
    });

    function releasePointer(event) {
      if (!interaction.isDragging) {
        return;
      }

      interaction.isDragging = false;
      stage.classList.remove("is-dragging");

      if (interaction.pointerId !== null) {
        try {
          stage.releasePointerCapture(event.pointerId);
        } catch (error) {
          void error;
        }
      }

      window.setTimeout(() => {
        interaction.moved = false;
      }, 0);
    }

    stage.addEventListener("pointerup", releasePointer);
    stage.addEventListener("pointercancel", releasePointer);

    stage.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        markMapInteraction();
        const nextZoom = app.state.zoom + (event.deltaY < 0 ? 0.12 : -0.12);
        setZoom(nextZoom);
      },
      { passive: false }
    );

    document.getElementById("zoomIn").addEventListener("click", () => {
      markMapInteraction();
      setZoom(app.state.zoom + 0.18);
    });
    document.getElementById("zoomOut").addEventListener("click", () => {
      markMapInteraction();
      setZoom(app.state.zoom - 0.18);
    });
    document.getElementById("resetView").addEventListener("click", resetView);
  }

  function bindTilt() {
    const shell = app.refs.mapShell;

    shell.addEventListener("pointermove", (event) => {
      const bounds = shell.getBoundingClientRect();
      const offsetX = (event.clientX - bounds.left) / bounds.width - 0.5;
      const offsetY = (event.clientY - bounds.top) / bounds.height - 0.5;
      shell.style.setProperty("--tilt-x", `${-offsetY * 2.2}deg`);
      shell.style.setProperty("--tilt-y", `${offsetX * 2.8}deg`);
    });

    shell.addEventListener("pointerleave", () => {
      shell.style.setProperty("--tilt-x", "0deg");
      shell.style.setProperty("--tilt-y", "0deg");
    });
  }

  function render() {
    app.refs.floorMap.setAttribute(
      "viewBox",
      `0 0 ${app.data.meta.viewBox.width} ${app.data.meta.viewBox.height}`
    );
    app.refs.floorMap.innerHTML = buildMapSvg();
    bindSpaceClicks();
    applyTransform();
    updateOverlayText();
    animateNavigator();
  }

  function initialize() {
    app.refs.mapShell = document.getElementById("mapShell");
    app.refs.mapStage = document.getElementById("mapStage");
    app.refs.floorMap = document.getElementById("floorMap");
    app.refs.mapOverlay = document.getElementById("mapOverlay");

    render();
    bindPanAndZoom();
    bindTilt();
  }

  app.map = {
    initialize,
    render,
    resetView
  };
})(window.CITmaps);
