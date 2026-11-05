(function registerNavigation(app) {
  const GRID_SIZE = 10;
  const SPACE_MARGIN = 2;
  const ACCESS_GAP = 26;
  let walkableGrid = null;

  function pointsEqual(left, right) {
    return Math.abs(left.x - right.x) < 1 && Math.abs(left.y - right.y) < 1;
  }

  function appendPoint(points, point) {
    if (!point) {
      return;
    }

    if (!points.length || !pointsEqual(points[points.length - 1], point)) {
      points.push({ x: point.x, y: point.y });
    }
  }

  function measurePolyline(points) {
    return points.slice(1).reduce((sum, point, index) => {
      return sum + app.utils.distance(point, points[index]);
    }, 0);
  }

  function clampToOverlap(start, end, preferred) {
    const rangeStart = Math.min(start, end);
    const rangeEnd = Math.max(start, end);

    if (rangeEnd - rangeStart < 24) {
      return (rangeStart + rangeEnd) / 2;
    }

    return app.utils.clamp(preferred, rangeStart + 12, rangeEnd - 12);
  }

  function pointInRect(x, y, rect, inset = 0) {
    return (
      x >= rect.x + inset &&
      x <= rect.x + rect.width - inset &&
      y >= rect.y + inset &&
      y <= rect.y + rect.height - inset
    );
  }

  function isCorridorPoint(x, y) {
    return app.data.corridors.some((corridor) =>
      app.utils.getCorridorShapes(corridor).some((shape) => pointInRect(x, y, shape))
    );
  }

  function isWalkableSupportSpacePoint(x, y) {
    return app.data.spaces.some((space) => {
      if (space.id !== "entrance" && space.routeWalkable !== true) {
        return false;
      }

      return app.utils.getSpaceShapes(space).some((shape) => pointInRect(x, y, shape));
    });
  }

  function isObstacleSpace(space) {
    return space?.id !== "entrance" && space?.routeBlock !== false;
  }

  function isWalkablePoint(x, y) {
    const outline = app.data.meta.buildingOutline;

    if (!pointInRect(x, y, outline)) {
      return false;
    }

    return isCorridorPoint(x, y) || isWalkableSupportSpacePoint(x, y);
  }

  function buildWalkableGrid() {
    if (walkableGrid) {
      return walkableGrid;
    }

    const { width, height } = app.data.meta.viewBox;
    const cols = Math.ceil(width / GRID_SIZE);
    const rows = Math.ceil(height / GRID_SIZE);
    const cells = Array.from({ length: rows }, () => new Uint8Array(cols));

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const point = cellCenter(col, row);
        cells[row][col] = isWalkablePoint(point.x, point.y) ? 1 : 0;
      }
    }

    walkableGrid = { cols, rows, cells };
    return walkableGrid;
  }

  function cellCenter(col, row) {
    return {
      x: col * GRID_SIZE + GRID_SIZE / 2,
      y: row * GRID_SIZE + GRID_SIZE / 2
    };
  }

  function pointToCell(point) {
    const grid = buildWalkableGrid();
    const rawCol = Math.round((point.x - GRID_SIZE / 2) / GRID_SIZE);
    const rawRow = Math.round((point.y - GRID_SIZE / 2) / GRID_SIZE);

    return {
      col: app.utils.clamp(rawCol, 0, grid.cols - 1),
      row: app.utils.clamp(rawRow, 0, grid.rows - 1)
    };
  }

  function cellKey(cell) {
    return `${cell.col},${cell.row}`;
  }

  function parseCellKey(key) {
    const [col, row] = key.split(",").map(Number);
    return { col, row };
  }

  function isWalkableCell(cell) {
    const grid = buildWalkableGrid();
    return Boolean(grid.cells[cell.row]?.[cell.col]);
  }

  function nearestWalkableCell(point) {
    const grid = buildWalkableGrid();
    const origin = pointToCell(point);
    const queue = [origin];
    const seen = new Set([cellKey(origin)]);

    while (queue.length) {
      const current = queue.shift();

      if (isWalkableCell(current)) {
        return current;
      }

      [
        { col: current.col + 1, row: current.row },
        { col: current.col - 1, row: current.row },
        { col: current.col, row: current.row + 1 },
        { col: current.col, row: current.row - 1 }
      ].forEach((next) => {
        if (
          next.col < 0 ||
          next.col >= grid.cols ||
          next.row < 0 ||
          next.row >= grid.rows
        ) {
          return;
        }

        const key = cellKey(next);

        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        queue.push(next);
      });
    }

    return null;
  }

  function findWalkablePath(startPoint, endPoint) {
    const grid = buildWalkableGrid();
    const startCell = nearestWalkableCell(startPoint);
    const endCell = nearestWalkableCell(endPoint);

    if (!startCell || !endCell) {
      return null;
    }

    const startKey = cellKey(startCell);
    const endKey = cellKey(endCell);
    const open = [startKey];
    const openSet = new Set(open);
    const cameFrom = {};
    const gScore = { [startKey]: 0 };
    const fScore = {
      [startKey]: Math.abs(startCell.col - endCell.col) + Math.abs(startCell.row - endCell.row)
    };

    while (open.length) {
      open.sort((left, right) => fScore[left] - fScore[right]);
      const currentKey = open.shift();
      const current = parseCellKey(currentKey);

      openSet.delete(currentKey);

      if (currentKey === endKey) {
        const points = [];
        let traceKey = currentKey;

        while (traceKey) {
          const cell = parseCellKey(traceKey);
          points.unshift(cellCenter(cell.col, cell.row));
          traceKey = cameFrom[traceKey];
        }

        return points;
      }

      [
        { col: current.col + 1, row: current.row },
        { col: current.col - 1, row: current.row },
        { col: current.col, row: current.row + 1 },
        { col: current.col, row: current.row - 1 }
      ].forEach((neighbor) => {
        if (
          neighbor.col < 0 ||
          neighbor.col >= grid.cols ||
          neighbor.row < 0 ||
          neighbor.row >= grid.rows ||
          !isWalkableCell(neighbor)
        ) {
          return;
        }

        const neighborKey = cellKey(neighbor);
        const tentative = gScore[currentKey] + 1;

        if (tentative >= (gScore[neighborKey] ?? Number.POSITIVE_INFINITY)) {
          return;
        }

        cameFrom[neighborKey] = currentKey;
        gScore[neighborKey] = tentative;
        fScore[neighborKey] =
          tentative +
          Math.abs(neighbor.col - endCell.col) +
          Math.abs(neighbor.row - endCell.row);

        if (!openSet.has(neighborKey)) {
          open.push(neighborKey);
          openSet.add(neighborKey);
        }
      });
    }

    return null;
  }

  function canWalkStraight(from, to) {
    if (Math.abs(from.x - to.x) >= 1 && Math.abs(from.y - to.y) >= 1) {
      return false;
    }

    const steps = Math.max(
      2,
      Math.ceil(Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) / (GRID_SIZE / 2))
    );

    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      const x = from.x + (to.x - from.x) * ratio;
      const y = from.y + (to.y - from.y) * ratio;

      if (!isWalkablePoint(x, y)) {
        return false;
      }
    }

    return true;
  }

  function isWalkablePolyline(points) {
    if (!points?.length) {
      return false;
    }

    return points.slice(1).every((point, index) => canWalkStraight(points[index], point));
  }

  function appendOrthogonal(points, point) {
    if (!points.length) {
      appendPoint(points, point);
      return;
    }

    const previous = points[points.length - 1];

    if (pointsEqual(previous, point)) {
      return;
    }

    if (Math.abs(previous.x - point.x) < 1 || Math.abs(previous.y - point.y) < 1) {
      appendPoint(points, point);
      return;
    }

    const bendA = { x: previous.x, y: point.y };
    const bendB = { x: point.x, y: previous.y };

    if (canWalkStraight(previous, bendA) && canWalkStraight(bendA, point)) {
      appendPoint(points, bendA);
      appendPoint(points, point);
      return;
    }

    if (canWalkStraight(previous, bendB) && canWalkStraight(bendB, point)) {
      appendPoint(points, bendB);
      appendPoint(points, point);
      return;
    }

    appendPoint(points, bendB);
    appendPoint(points, point);
  }

  function normalizePath(points) {
    const normalized = [];

    points.forEach((point) => appendPoint(normalized, point));

    let changed = true;

    while (changed) {
      changed = false;

      for (let index = 1; index < normalized.length - 1; index += 1) {
        const previous = normalized[index - 1];
        const current = normalized[index];
        const next = normalized[index + 1];
        const sameX =
          Math.abs(previous.x - current.x) < 1 && Math.abs(current.x - next.x) < 1;
        const sameY =
          Math.abs(previous.y - current.y) < 1 && Math.abs(current.y - next.y) < 1;

        if ((sameX || sameY) && canWalkStraight(previous, next)) {
          normalized.splice(index, 1);
          changed = true;
          break;
        }
      }
    }

    return normalized;
  }

  function getSpaceAccessPoint(space) {
    if (!space) {
      return null;
    }

    if (space.accessPoint) {
      return space.accessPoint;
    }

    const node = app.utils.getNodeById(space.entryNode);

    if (!node) {
      return null;
    }

    const padding = 12;
    const inset = 18;
    const minX = space.x + inset;
    const maxX = space.x + space.width - inset;
    const minY = space.y + inset;
    const maxY = space.y + space.height - inset;
    const clampX = app.utils.clamp(node.x, minX, maxX);
    const clampY = app.utils.clamp(node.y, minY, maxY);

    if (node.x <= space.x) {
      return { x: space.x - padding, y: clampY };
    }

    if (node.x >= space.x + space.width) {
      return { x: space.x + space.width + padding, y: clampY };
    }

    if (node.y <= space.y) {
      return { x: clampX, y: space.y - padding };
    }

    if (node.y >= space.y + space.height) {
      return { x: clampX, y: space.y + space.height + padding };
    }

    const distances = [
      { edge: "left", distance: Math.abs(node.x - space.x) },
      { edge: "right", distance: Math.abs(space.x + space.width - node.x) },
      { edge: "top", distance: Math.abs(node.y - space.y) },
      { edge: "bottom", distance: Math.abs(space.y + space.height - node.y) }
    ].sort((left, right) => left.distance - right.distance);

    switch (distances[0].edge) {
      case "left":
        return { x: space.x - padding, y: clampY };
      case "right":
        return { x: space.x + space.width + padding, y: clampY };
      case "top":
        return { x: clampX, y: space.y - padding };
      default:
        return { x: clampX, y: space.y + space.height + padding };
    }
  }

  function buildFallbackAccessPath(space) {
    const node = app.utils.getNodeById(space?.entryNode);
    const accessPoint = getSpaceAccessPoint(space);
    const path = [];

    appendPoint(path, node);

    if (
      node &&
      accessPoint &&
      Math.abs(node.x - accessPoint.x) >= 1 &&
      Math.abs(node.y - accessPoint.y) >= 1
    ) {
      const verticalThenDoor = { x: node.x, y: accessPoint.y };
      const horizontalThenDoor = { x: accessPoint.x, y: node.y };

      if (canWalkStraight(node, verticalThenDoor)) {
        appendPoint(path, verticalThenDoor);
      } else if (canWalkStraight(node, horizontalThenDoor)) {
        appendPoint(path, horizontalThenDoor);
      }
    }

    appendPoint(path, accessPoint);
    const normalized = normalizePath(path);

    return isWalkablePolyline(normalized) ? normalized : node ? [node] : [];
  }

  function buildNodeAccessPath(space) {
    const node = app.utils.getNodeById(space?.entryNode);

    if (!node) {
      return [];
    }

    if (space.id === "entrance") {
      return [node];
    }

    if (!space.accessPath?.length) {
      const corridorOptions = buildCorridorAccessOptions(space);
      let bestPath = null;

      corridorOptions.forEach((option) => {
        const corridorAnchor = option[0] ? { ...option[0] } : null;

        if (corridorAnchor && Math.abs(corridorAnchor.x - node.x) <= GRID_SIZE) {
          corridorAnchor.x = node.x;
        }

        if (corridorAnchor && Math.abs(corridorAnchor.y - node.y) <= GRID_SIZE) {
          corridorAnchor.y = node.y;
        }

        const adjustedOption = corridorAnchor ? [corridorAnchor, ...option.slice(1)] : option;
        const isAlignedConnector =
          corridorAnchor &&
          (Math.abs(node.x - corridorAnchor.x) < 1 || Math.abs(node.y - corridorAnchor.y) < 1);

        if (corridorAnchor && !isAlignedConnector) {
          return;
        }

        const connector = corridorAnchor
          ? isAlignedConnector
            ? [node, corridorAnchor]
            : buildWalkablePolyline(node, corridorAnchor)
          : [node];

        if (!connector?.length) {
          return;
        }

        const path = [];
        connector.forEach((point) => appendPoint(path, point));
        adjustedOption.slice(1).forEach((point) => appendPoint(path, point));
        const normalized = normalizePath(path);

        if (
          isWalkablePolyline(normalized) &&
          (!bestPath || measurePolyline(normalized) < measurePolyline(bestPath))
        ) {
          bestPath = normalized;
        }
      });

      return bestPath || buildFallbackAccessPath(space);
    }

    const path = [];
    appendPoint(path, node);
    space.accessPath.forEach((point) => appendPoint(path, point));
    const normalized = normalizePath(path);

    if (isWalkablePolyline(normalized)) {
      return normalized;
    }

    const corridorOptions = buildCorridorAccessOptions(space).filter(isWalkablePolyline);
    return corridorOptions[0] || buildFallbackAccessPath(space);
  }

  function findGraphNodePath(startNodeId, endNodeId) {
    if (!startNodeId || !endNodeId || !app.graph?.adjacency) {
      return null;
    }

    const distances = { [startNodeId]: 0 };
    const previous = {};
    const open = new Set([startNodeId]);

    while (open.size) {
      const currentId = [...open].sort(
        (left, right) =>
          (distances[left] ?? Number.POSITIVE_INFINITY) -
          (distances[right] ?? Number.POSITIVE_INFINITY)
      )[0];

      open.delete(currentId);

      if (currentId === endNodeId) {
        const nodeIds = [];
        let traceId = endNodeId;

        while (traceId) {
          nodeIds.unshift(traceId);
          traceId = previous[traceId];
        }

        return nodeIds;
      }

      (app.graph.adjacency[currentId] || []).forEach((edge) => {
        const tentativeDistance = distances[currentId] + edge.weight;

        if (tentativeDistance >= (distances[edge.id] ?? Number.POSITIVE_INFINITY)) {
          return;
        }

        distances[edge.id] = tentativeDistance;
        previous[edge.id] = currentId;
        open.add(edge.id);
      });
    }

    return null;
  }

  function buildGraphPolyline(nodeIds) {
    const points = [];

    nodeIds.forEach((nodeId, index) => {
      if (index === 0) {
        appendPoint(points, app.utils.getNodeById(nodeId));
        return;
      }

      const previousNodeId = nodeIds[index - 1];
      const edgePath = app.graph?.edgeMap?.[`${previousNodeId}->${nodeId}`];

      if (edgePath?.length) {
        edgePath.forEach((point) => appendPoint(points, point));
        return;
      }

      appendPoint(points, app.utils.getNodeById(nodeId));
    });

    return normalizePath(points);
  }

  function getPathKey(points) {
    return points
      .map((point) => `${Math.round(point.x)},${Math.round(point.y)}`)
      .join("|");
  }

  function addUniquePath(target, seen, path) {
    const normalized = normalizePath((path || []).map((point) => ({ x: point.x, y: point.y })));

    if (!normalized.length) {
      return;
    }

    if (!isWalkablePolyline(normalized)) {
      return;
    }

    const key = getPathKey(normalized);

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    target.push(normalized);
  }

  function buildCorridorAccessOptions(space) {
    if (!space) {
      return [];
    }

    const candidates = [];
    const preferenceX = space.labelX ?? space.x + space.width / 2;
    const preferenceY = space.labelY ?? space.y + space.height / 2;
    const spaceShapes = app.utils.getSpaceShapes(space);

    app.data.corridors.forEach((corridor) => {
      app.utils.getCorridorShapes(corridor).forEach((corridorShape) => {
        const corridorCenterX = corridorShape.x + corridorShape.width / 2;
        const corridorCenterY = corridorShape.y + corridorShape.height / 2;

        spaceShapes.forEach((spaceShape) => {
          const overlapXStart = Math.max(spaceShape.x, corridorShape.x);
          const overlapXEnd = Math.min(spaceShape.x + spaceShape.width, corridorShape.x + corridorShape.width);
          const overlapYStart = Math.max(spaceShape.y, corridorShape.y);
          const overlapYEnd = Math.min(spaceShape.y + spaceShape.height, corridorShape.y + corridorShape.height);
          const overlapWidth = overlapXEnd - overlapXStart;
          const overlapHeight = overlapYEnd - overlapYStart;
          const horizontalGapLeft = Math.abs(spaceShape.x - (corridorShape.x + corridorShape.width));
          const horizontalGapRight = Math.abs(corridorShape.x - (spaceShape.x + spaceShape.width));
          const verticalGapTop = Math.abs(spaceShape.y - (corridorShape.y + corridorShape.height));
          const verticalGapBottom = Math.abs(corridorShape.y - (spaceShape.y + spaceShape.height));

          if (overlapWidth >= 6 && verticalGapTop <= ACCESS_GAP) {
            const x = clampToOverlap(overlapXStart, overlapXEnd, preferenceX);
            candidates.push({
              score: verticalGapTop * 1000 + Math.abs(preferenceX - x),
              path: [
                { x, y: corridorCenterY },
                { x, y: spaceShape.y - 12 }
              ]
            });
          }

          if (overlapWidth >= 6 && verticalGapBottom <= ACCESS_GAP) {
            const x = clampToOverlap(overlapXStart, overlapXEnd, preferenceX);
            candidates.push({
              score: verticalGapBottom * 1000 + Math.abs(preferenceX - x),
              path: [
                { x, y: corridorCenterY },
                { x, y: spaceShape.y + spaceShape.height + 12 }
              ]
            });
          }

          if (overlapHeight >= 6 && horizontalGapLeft <= ACCESS_GAP) {
            const y = clampToOverlap(overlapYStart, overlapYEnd, preferenceY);
            candidates.push({
              score: horizontalGapLeft * 1000 + Math.abs(preferenceY - y),
              path: [
                { x: corridorCenterX, y },
                { x: spaceShape.x - 12, y }
              ]
            });
          }

          if (overlapHeight >= 6 && horizontalGapRight <= ACCESS_GAP) {
            const y = clampToOverlap(overlapYStart, overlapYEnd, preferenceY);
            candidates.push({
              score: horizontalGapRight * 1000 + Math.abs(preferenceY - y),
              path: [
                { x: corridorCenterX, y },
                { x: spaceShape.x + spaceShape.width + 12, y }
              ]
            });
          }
        });
      });
    });

    if (!candidates.length) {
      return [];
    }

    return candidates
      .sort((left, right) => left.score - right.score)
      .map((candidate) => normalizePath(candidate.path));
  }

  function getSpaceAccessOptions(space) {
    if (!space) {
      return [[]];
    }

    if (space.id === "entrance") {
      return [[app.utils.getNodeById(space.entryNode)]].filter((option) => option[0]);
    }

    const options = [];
    const seen = new Set();

    if (space.accessPath?.length) {
      addUniquePath(
        options,
        seen,
        space.accessPath.map((point) => ({ x: point.x, y: point.y }))
      );

      if (options.length) {
        return options;
      }
    }

    buildCorridorAccessOptions(space).forEach((option) => addUniquePath(options, seen, option));

    if (!options.length) {
      addUniquePath(options, seen, buildFallbackAccessPath(space));
    }

    return options.length ? options : [[]];
  }

  function buildWalkablePolyline(startAnchor, endAnchor) {
    if (canWalkStraight(startAnchor, endAnchor)) {
      return normalizePath([startAnchor, endAnchor]);
    }

    const rawGridPath = findWalkablePath(startAnchor, endAnchor);

    if (!rawGridPath?.length) {
      return null;
    }

    if (rawGridPath.length > 1 && canWalkStraight(startAnchor, rawGridPath[1])) {
      rawGridPath.shift();
    }

    if (
      rawGridPath.length > 1 &&
      canWalkStraight(rawGridPath[rawGridPath.length - 2], endAnchor)
    ) {
      rawGridPath.pop();
    }

    const points = [];
    appendPoint(points, startAnchor);

    rawGridPath.forEach((point) => {
      appendOrthogonal(points, point);
    });

    appendOrthogonal(points, endAnchor);
    return normalizePath(points);
  }

  function getAreaLabelForPoint(point) {
    if (pointInRect(point.x, point.y, app.utils.getSpaceById("entrance") || { x: 0, y: 0, width: 0, height: 0 })) {
      return "Entrance Lobby";
    }

    for (const corridor of app.data.corridors) {
      const matches = app.utils.getCorridorShapes(corridor).some((shape) =>
        pointInRect(point.x, point.y, shape)
      );

      if (matches) {
        return corridor.name;
      }
    }

    return "Open Circulation Space";
  }

  function summarizeAreas(points) {
    return app.utils.unique(points.map((point) => getAreaLabelForPoint(point)));
  }

  function describeSegment(from, to) {
    if (to.x > from.x) {
      return "right";
    }

    if (to.x < from.x) {
      return "left";
    }

    if (to.y > from.y) {
      return "down";
    }

    return "up";
  }

  function createRouteSteps(route) {
    if (route.startSpace.id === route.endSpace.id) {
      return [
        `You are already at ${route.endSpace.name}. No navigation is needed.`
      ];
    }

    const steps = [`Start at ${route.startSpace.name}.`];
    const segments = route.points.slice(1).map((point, index) => ({
      from: route.points[index],
      to: point,
      direction: describeSegment(route.points[index], point),
      distancePx: app.utils.distance(route.points[index], point)
    }));

    segments
      .filter((segment) => segment.distancePx >= 18)
      .forEach((segment, index) => {
        const distance = app.utils.formatDistance(app.utils.pixelsToMeters(segment.distancePx));
        const lead = index === 0 ? "Move" : "Then move";

        steps.push(`${lead} ${segment.direction} for ${distance}.`);
      });

    steps.push(`Arrive at ${route.endSpace.name}.`);
    return steps;
  }

  function finalizeRoute(startSpace, endSpace, points) {
    const normalizedPoints = normalizePath(points);
    const distancePx = measurePolyline(normalizedPoints);
    const distanceMeters = app.utils.pixelsToMeters(distancePx);
    const etaSeconds = app.utils.metersToEta(distanceMeters);

    return {
      startSpace,
      endSpace,
      nodeIds: normalizedPoints.map((point, index) => `${index}:${point.x},${point.y}`),
      points: normalizedPoints,
      distancePx,
      distanceMeters,
      etaSeconds,
      corridorSummary: summarizeAreas(normalizedPoints),
      steps: createRouteSteps({
        startSpace,
        endSpace,
        points: normalizedPoints
      })
    };
  }

  function buildGraphRoute(startSpace, endSpace) {
    const graphNodePath = findGraphNodePath(startSpace.entryNode, endSpace.entryNode);

    if (!graphNodePath?.length) {
      return null;
    }

    const graphPath = buildGraphPolyline(graphNodePath);

    if (!isWalkablePolyline(graphPath)) {
      return null;
    }

    const startAccessPath = buildNodeAccessPath(startSpace);
    const endAccessPath = buildNodeAccessPath(endSpace);
    const points = [];

    [...startAccessPath].reverse().forEach((point) => appendPoint(points, point));
    graphPath.forEach((point) => appendPoint(points, point));
    endAccessPath.forEach((point) => appendPoint(points, point));

    const normalized = normalizePath(points);

    if (!isWalkablePolyline(normalized)) {
      return null;
    }

    return finalizeRoute(startSpace, endSpace, normalized);
  }

  function buildWalkableRoute(startSpace, endSpace) {
    const startOptions = getSpaceAccessOptions(startSpace).map((option) =>
      normalizePath([...option].reverse())
    );
    const endOptions = getSpaceAccessOptions(endSpace);
    let bestRoute = null;

    startOptions.forEach((startAccessPath) => {
      const startAnchor =
        startAccessPath[startAccessPath.length - 1] ||
        getSpaceAccessPoint(startSpace) ||
        app.utils.getNodeById(startSpace.entryNode);

      if (!startAnchor) {
        return;
      }

      endOptions.forEach((endAccessPath) => {
        const endAnchor =
          endAccessPath[0] ||
          getSpaceAccessPoint(endSpace) ||
          app.utils.getNodeById(endSpace.entryNode);

        if (!endAnchor) {
          return;
        }

        const corridorPath = buildWalkablePolyline(startAnchor, endAnchor);

        if (!corridorPath?.length) {
          return;
        }

        const points = [];

        if (startAccessPath.length) {
          startAccessPath.forEach((point) => appendPoint(points, point));
        } else {
          appendPoint(points, startAnchor);
        }

        corridorPath.forEach((point, index) => {
          if (index === 0 && points.length && pointsEqual(points[points.length - 1], point)) {
            return;
          }

          appendPoint(points, point);
        });

        endAccessPath.forEach((point, index) => {
          if (index === 0 && points.length && pointsEqual(points[points.length - 1], point)) {
            return;
          }

          appendPoint(points, point);
        });

        const normalized = normalizePath(points);

        if (!isWalkablePolyline(normalized)) {
          return;
        }

        const route = finalizeRoute(startSpace, endSpace, normalized);

        if (!bestRoute || route.distancePx < bestRoute.distancePx) {
          bestRoute = route;
        }
      });
    });

    return bestRoute;
  }

  function buildRoute(startSpaceId, endSpaceId) {
    const startSpace = app.utils.getSpaceById(startSpaceId);
    const endSpace = app.utils.getSpaceById(endSpaceId);

    if (!startSpace || !endSpace) {
      return null;
    }

    if (startSpace.id === "entrance" && endSpace.id === "reception") {
      const startNode = app.utils.getNodeById(startSpace.entryNode);
      const endNode = app.utils.getNodeById(endSpace.entryNode);

      if (startNode && endNode) {
        return finalizeRoute(startSpace, endSpace, [
          { x: startNode.x, y: startNode.y },
          { x: endNode.x, y: endNode.y }
        ]);
      }
    }

    const routes = [buildGraphRoute(startSpace, endSpace), buildWalkableRoute(startSpace, endSpace)]
      .filter(Boolean)
      .sort((left, right) => left.distancePx - right.distancePx);

    return routes[0] || null;
  }

  app.navigation = {
    buildRoute
  };
})(window.CITmaps);
