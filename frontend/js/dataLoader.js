(function registerDataLoader(app) {
  const DATA_VERSION = "20260508-corridor-strict2";

  async function loadJson(path) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`${path}${separator}v=${DATA_VERSION}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }

    return response.json();
  }

  function normalizeData(locations, graph) {
    const spaces = locations.spaces.map((space) => ({
      ...space,
      ...(() => {
        const shapes = app.utils.getSpaceShapes(space);
        const minX = Math.min(...shapes.map((shape) => shape.x));
        const minY = Math.min(...shapes.map((shape) => shape.y));
        const maxX = Math.max(...shapes.map((shape) => shape.x + shape.width));
        const maxY = Math.max(...shapes.map((shape) => shape.y + shape.height));

        return {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          shapes
        };
      })(),
      labelLines: space.labelLines?.length ? space.labelLines : [space.name],
      showMapLabel: space.showMapLabel === true
    }));
    const corridors = locations.corridors.map((corridor) => ({
      ...corridor,
      shapes: app.utils.getCorridorShapes(corridor)
    }));

    const spaceMap = Object.fromEntries(spaces.map((space) => [space.id, space]));
    const nodeMap = Object.fromEntries(graph.nodes.map((node) => [node.id, node]));
    const adjacency = {};
    const edgeMap = {};

    function getPathDistance(points) {
      return points.slice(1).reduce((sum, point, index) => {
        return sum + app.utils.distance(point, points[index]);
      }, 0);
    }

    graph.nodes.forEach((node) => {
      adjacency[node.id] = [];
    });

    graph.edges.forEach((edge) => {
      const from = nodeMap[edge.from];
      const to = nodeMap[edge.to];
      const forwardPath = [
        { x: from.x, y: from.y },
        ...(edge.via || []),
        { x: to.x, y: to.y }
      ];
      const reversePath = [...forwardPath].reverse();
      const weight = edge.weight ?? getPathDistance(forwardPath);

      adjacency[edge.from].push({ id: edge.to, weight });
      edgeMap[`${edge.from}->${edge.to}`] = forwardPath;

      if (edge.bidirectional !== false) {
        adjacency[edge.to].push({ id: edge.from, weight });
        edgeMap[`${edge.to}->${edge.from}`] = reversePath;
      }
    });

    app.data = {
      ...locations,
      corridors,
      spaces,
      spaceMap
    };

    app.graph = {
      ...graph,
      nodeMap,
      adjacency,
      edgeMap
    };

    app.state.startLocationId = locations.meta.defaultStart;
  }

  async function loadData() {
    try {
      const [locations, graph] = await Promise.all([
        loadJson("./data/locations.json"),
        loadJson("./data/navigationGraph.json")
      ]);

      normalizeData(locations, graph);
      return app;
    } catch (error) {
      throw new Error(
        `${error.message}. Run CITmaps through a local web server so the JSON files can be loaded.`
      );
    }
  }

  app.loadData = loadData;
})(window.CITmaps);
