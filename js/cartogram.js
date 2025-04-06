class Cartogram {
  /**
   * Class constructor with initial configuration
   * @param {Object}
   * @param {Array}
   * @param {Array}
   */
  constructor(_config, _data, _raceCategories) {
    this.config = {
      parentElement: _config.parentElement,
      containerWidth: 1300,
      containerHeight: 1000,
      margin: { top: 120, right: 20, bottom: 20, left: 20 },
      // M4 TODO: change square sizes and square spacing depending on size of the visualization
      minSquareSize: 70,
      maxSquareSize: 200,
      squareSpacing: 80,
      tileColourLegendBottom: 10,
      tileColourLegendLeft: 150,
      tileColourLegendRectHeight: 12,
      tileColourLegendRectWidth: 500,
      numBins: 11,
      tileSizeLegendBottom: 260, // TODO - adjust tile size legend location
      tileSizeLegendLeft: 450,
      tileSizeLegendHeight: 330,
      tileSizeLegendWidth: 330,
      pieLegendBottom: 550,
      pieLegendLeft: 500, // TODO - adjust pie chart legend location
      pieLegendHeight: 200,
      pieLegendWidth: 350,
    };
    this.data = _data;
    this.raceCategories = _raceCategories;
    this.initVis();
  }

  /**
   * We initialize the arc generator, scales, axes, and append static elements
   */
  initVis() {
    let vis = this;
    const {
      containerWidth,
      containerHeight,
      margin,
      minSquareSize,
      maxSquareSize,
    } = vis.config;

    // Set up the SVG container
    vis.svg = d3
      .select(vis.config.parentElement)
      .append("svg")
      .attr("width", containerWidth)
      .attr("height", containerHeight)
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Adds tile size scaling based on population density
    // M4 TODO: change scaling depending on data? May want to use a scale other than square root
    vis.tileSizeScale = d3
      .scaleLinear()
      .domain([
        d3.min(vis.data, (d) => d.proportionAffected),
        d3.max(vis.data, (d) => d.proportionAffected),
      ])
      .range([minSquareSize, maxSquareSize]);

    // Create a group for the tile grid
    vis.tileGrid = vis.svg.append("g").attr("class", "tile-grid");

    // Empty group for the tile colour legend
    vis.tileColourLegend = vis.svg
      .append("g")
      .attr("class", "legend")
      .attr(
        "transform",
        `translate(${vis.config.tileColourLegendLeft}, ${vis.config.tileColourLegendBottom})`
      );

    // Empty group for the tile size legend
    vis.tileSizeLegend = vis.svg
      .append("g")
      .attr("class", "legend")
      .attr(
        "transform",
        `translate(${vis.config.tileSizeLegendLeft}, ${vis.config.tileSizeLegendBottom})`
      );

    // Empty group for pie chart legend
    vis.pieLegend = vis.svg
      .append("g")
      .attr("class", "legend")
      .attr(
        "transform",
        `translate(${vis.config.pieLegendLeft}, ${vis.config.pieLegendBottom})`
      );

    // diverging colour scale for tile grid
    vis.gridColourScale = d3
      .scaleDiverging()
      .domain([0, 0.5, 1])
      .interpolator(d3.interpolatePuOr);

    // pie chart colour scheme
    vis.pieColourScale = d3
      .scaleOrdinal(d3.schemeBuGn[vis.raceCategories.length])
      .domain(vis.raceCategories);

    // create pie chart generator
    vis.pieGenerator = d3
      .pie()
      .value((d) => d.value)
      .startAngle(0)
      .endAngle(2 * Math.PI)
      .sort(null); // disable automatic sorting

    // create arc for each segment in pie chart
    vis.arcGenerator = d3
      .arc()
      .innerRadius(0)
      // M4? or M3 TODO: Change sizes of pie charts
      .outerRadius(minSquareSize * 0.3);

    // M4 TODO: Add disclaimer for racial data

    vis.updateVis();
    vis.renderTileColorLegend();
    vis.renderTileSizeLegend();
    vis.renderPieLegend();
  }

  /**
   * Preprocess data before rendering
   * This preprocessor assumes that the cartogram grid data is ordered by
   * x-coordinate first and y-coordinate second in ascending order.
   */
  updateVis() {
    let vis = this;
    const { squareSpacing } = vis.config;

    // Calculate x-coordinate for each State
    let currentX = -1;
    let currentXCoord = -1;
    let currentMaxX = -1;

    vis.data.forEach((d) => {
      // if X-coordinate is the same, get the max tile size of the column
      if (currentX == d.x) {
        if (vis.tileSizeScale(d.proportionAffected) > currentMaxX) {
          currentMaxX = vis.tileSizeScale(d.proportionAffected);
        }
      } else {
        // otherwise, get the new X-coordinate for the next column
        currentXCoord = currentXCoord + currentMaxX;
        currentX = d.x;
        currentMaxX = vis.tileSizeScale(d.proportionAffected);
      }
      d.xCoord = currentXCoord;
    });

    // Calculate y-coordinate for each State
    let currentY = -1;
    let currentYCoord = -1;
    let nextYCoord = -1;
    // TODO (optional): refactor this to calculate both x-coordinate and y-coordinate in 1 loop instead of 2
    vis.data.forEach((d) => {
      // check if tile is in the same column
      // if tiles aren't adjacent to eachother, place new tile based on y value and spacing
      // otherwise ignore conditional statements and place new tile vertically below previous tile
      currentY += 1;
      if ((currentX == d.x) & (currentY != d.y)) {
        nextYCoord = d.y * squareSpacing;
      } else if (currentX != d.x) {
        // if tile is in new column, place new tile based on y value and spacing
        nextYCoord = d.y * squareSpacing;
        currentY = d.y;
        currentX = d.x;
      }
      currentYCoord = nextYCoord;
      nextYCoord = currentYCoord + vis.tileSizeScale(d.proportionAffected);
      d.yCoord = currentYCoord;
    });

    // Center align x-coordinates
    vis.data.forEach((d) => {
      let currentData = vis.data.filter((filtered) => filtered.x == d.x);
      let currentMax = d3.max(currentData, (f) => f.proportionAffected);
      if (currentMax != d.proportionAffected) {
        d.xCoord =
          d.xCoord +
          (vis.tileSizeScale(currentMax) -
            vis.tileSizeScale(d.proportionAffected)) /
            2;
      }
    });

    // M4 TODO: Add tooltips for pie charts/tilegrid

    vis.renderVis();
  }

  /**
   * Render and join visual elements
   */
  renderVis() {
    let vis = this;

    // Create rectangles for each State
    vis.tileGrid
      .selectAll("rect")
      .data(vis.data)
      .join("rect")
      .attr("x", (d) => d.xCoord)
      .attr("y", (d) => d.yCoord)
      .attr("width", (d) => vis.tileSizeScale(d.proportionAffected))
      .attr("height", (d) => vis.tileSizeScale(d.proportionAffected))
      .attr("fill", (d) => {
        return vis.gridColourScale(d.proportionNonWhite);
      })
      .attr("stroke", "white")
      .attr("stroke-width", 1);

    // Create pie charts
    vis.tileGrid
      .selectAll("pie-chart")
      .data(vis.data)
      .join("g")
      .attr(
        "transform",
        (d) =>
          `translate(${
            d.xCoord + vis.tileSizeScale(d.proportionAffected) / 2
          },${d.yCoord + vis.tileSizeScale(d.proportionAffected) / 2})`
      )
      .selectAll("path")
      .data((d) => vis.pieGenerator(d.pieData))
      .join("path")
      .attr("d", vis.arcGenerator)
      .attr("fill", (d) => vis.pieColourScale(d.data.race))
      .style("stroke", "white")
      .style("stroke-width", "0.75px");

    // Add text for each State
    vis.tileGrid
      .selectAll("text")
      .data(vis.data)
      .join("text")
      .attr("x", (d) => d.xCoord + vis.tileSizeScale(d.proportionAffected) / 2)
      .attr("y", (d) => d.yCoord + vis.tileSizeScale(d.proportionAffected) / 10)
      .attr("dy", ".35em")
      .attr("text-anchor", "middle")
      .attr("fill", "black")
      .attr("font-size", "12px")
      .text((d) => d.abbr);
  }

  /**
   * Initialize and render legend
   */
  renderTileColorLegend() {
    let vis = this;

    // Configuration for tile colour bins
    const binWidth = vis.config.tileColourLegendRectWidth / vis.config.numBins;
    const binHeight = vis.config.tileColourLegendRectHeight;
    const binValues = d3.range(0, 1 + 1e-9, 1 / vis.config.numBins);

    // Draw binned rectangles
    vis.tileColourLegend
      .selectAll("rect")
      .data(d3.pairs(binValues)) // turns [0,0.2,0.4,...] into [[0,0.2], [0.2,0.4], ...]
      .join("rect")
      .attr("class", `legend-element-tile-color`)
      .attr("x", (d, i) => i * binWidth)
      .attr("width", binWidth)
      .attr("height", binHeight)
      .attr("fill", (d) => vis.gridColourScale((d[0] + d[1]) / 2))
      .attr("stroke", "black")
      .attr("stroke-width", 0.5);

    // Generate text labels for tile color legend bins --- TODO credit chatGPT
    const tileColorLabelText = (start, end) => {
      const startPct = Math.round(start * 100);
      const endPct = Math.round(end * 100);
      const mid = (start + end) / 2;

      if (end <= 0.5) {
        // More white
        return `${100 - endPct}–${100 - startPct}%`;
      } else if (start >= 0.5) {
        // More non-white
        return `${Math.round(startPct)}–${Math.round(endPct)}%`;
      } else {
        return `~50/50`;
      }
    };

    // Add bin labels below each rect
    vis.tileColourLegend
      .selectAll("text")
      .data(d3.pairs(binValues))
      .join("text")
      .attr("class", `legend-element-race-distribution`)
      .attr("x", (d, i) => i * binWidth + binWidth / 2)
      .attr("y", binHeight + 12)
      .attr("text-anchor", "middle")
      .style("font-size", "9px")
      .text((d) => tileColorLabelText(d[0], d[1]));

    // Add legend axis text
    vis.tileColourLegend
      .append("text")
      .attr("class", "legend-axis-text")
      .attr("dy", "0.75em")
      .attr("y", binHeight - 25)
      .attr("x", vis.config.tileColourLegendRectWidth / 2 - 105)
      .attr("font-size", "11px")
      .text("← White Majority");

    vis.tileColourLegend
      .append("text")
      .attr("class", "legend-axis-text")
      .attr("dy", "0.75em")
      .attr("y", binHeight - 25)
      .attr("x", vis.config.tileColourLegendRectWidth / 2 + 25)
      .attr("font-size", "11px")
      .text("Non-White Majority →");

    // Title for tile color legend
    vis.tileColourLegend
      .append("text")
      .attr("class", "legend-title")
      .attr("dy", ".35em")
      .attr("y", -30)
      .attr("x", vis.config.tileColourLegendRectWidth / 2)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text("State Color Legend: Proportion of White vs Non-White Population");
  }

  renderTileSizeLegend() {
    let vis = this;
    // TODO Remove this? this is here mainly to visualize what I'm doing
    vis.tileSizeLegend
      .append("rect")
      .attr("x", vis.config.tileSizeLegendLeft)
      .attr("y", vis.config.tileSizeLegendBottom)
      .attr("width", vis.config.tileSizeLegendWidth)
      .attr("height", vis.config.tileSizeLegendHeight)
      .attr("fill", "white")
      .attr("stroke", "grey")
      .attr("stroke-width", 1)
      .attr("rx", 10)
      .attr("ry", 10);

    // Sample propportion values for legend
    const legendValues = [100, 75, 50, 25, 10, 5, 1];
    const spacing = 25;

    // Legend title
    vis.tileSizeLegend
      .append("text")
      .attr("x", vis.config.tileSizeLegendLeft + spacing * 1.5)
      .attr("y", vis.config.tileSizeLegendBottom + spacing)
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text("State Size: Percentage of Affected Population");

    // Append disclaimer
    vis.tileSizeLegend
      .append("text")
      .attr("class", "legend-disclaimer")
      .attr("font-size", "10px")
      .attr("font-style", "italic")
      .attr("text-anchor", "middle")
      .attr("x", vis.config.tileSizeLegendLeft + spacing * 6.5)
      .attr("y", vis.config.tileSizeLegendBottom + spacing * 1.7)
      .text("Normalized by total state population in 2020");

    // Starting position for the largest square
    const startX = vis.config.tileSizeLegendLeft + spacing * 2.5;
    const startY = vis.config.tileSizeLegendBottom + spacing * 2.5;

    // draw square and label for each square
    // For each value, draw a square and label
    legendValues.forEach((value, i) => {
      const size = vis.tileSizeScale(value);

      // Draw square
      vis.tileSizeLegend
        .append("rect")
        .attr("class", `legend-icon cat cat${value}`)
        .attr("x", startX)
        .attr("y", startY)
        .attr("width", size)
        .attr("height", size)
        .attr("fill", "grey")
        .attr("opacity", 0.2)
        .attr("stroke", "black")
        .attr("stroke-width", 1);
    });

    // Add labels with connecting lines
    legendValues.forEach((value, i) => {
      const size = vis.tileSizeScale(value);
      const labelY = startY + size; // Position at bottom of each square
      const labelX = startX - 10; //Horizontal position to the left of the squares

      // Spread out smallest two values (1%, 5%)
      let labelYOffset = 0;
      let labelXOffset = 0;

      if (value === 1) {
        labelYOffset = -28;
        labelXOffset = -20;
      } else if (value === 5) {
        labelYOffset = -14;
        labelXOffset = -20;
      }

      // Add text label
      vis.tileSizeLegend
        .append("text")
        .attr("class", `legend-label cat cat${value}`)
        .attr("x", labelX + labelXOffset)
        .attr("y", labelY + labelYOffset)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "11px")
        .text(`${value}%`);

      // Add connecting lines with bends for 1% and 5%
      let bendXOffset = -3;
      if (value === 1) bendXOffset = -6;
      if (value === 1 || value === 5) {
        // Create path with horizontal and vertical segments for bent line
        vis.tileSizeLegend
          .append("path")
          .attr("d", () => {
            // TODO -- credit Claude for creating bent line
            // Start at text position + gap
            const startX = labelX + labelXOffset + 5;
            const startY = labelY + labelYOffset;

            // Horizontal line to the right
            const bendX = labelX - bendXOffset;

            // Vertical line down to square bottom level
            const endY = labelY;

            // Horizontal line to square
            return `M${startX},${startY} L${bendX},${startY} L${bendX},${endY} L${
              labelX + 10
            },${endY}`;
          })
          .attr("fill", "none")
          .attr("stroke", "black")
          .attr("stroke-width", 1);
      } else {
        // For other values, use a simple horizontal line
        vis.tileSizeLegend
          .append("line")
          .attr("x1", labelX + labelXOffset + 5)
          .attr("y1", labelY + labelYOffset)
          .attr("x2", startX)
          .attr("y2", labelY)
          .attr("stroke", "black")
          .attr("stroke-width", 1);
      }
    });
  }

  renderPieLegend() {
    let vis = this;

    const swatchSize = 12;
    const swatchSpacing = 22;
    const legendPadding = 10;

    // legend background
    vis.pieLegend
      .append("rect")
      .attr("x", -legendPadding)
      .attr("y", -legendPadding - 15)
      .attr("width", vis.config.pieLegendWidth)
      .attr("height", vis.config.pieLegendHeight)
      .attr("fill", "white")
      .attr("stroke", "grey")
      .attr("stroke-width", 1)
      .attr("rx", 10)
      .attr("ry", 10);

    // legend title
    vis.pieLegend
      .append("text")
      .attr("class", "legend-title")
      .attr("y", -vis.pieLegendHeight)
      .attr("x", vis.config.pieLegendWidth / 2 - legendPadding)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text("Pie Chart: Racial Distribution of Non-White Population");

    // Add legend entry group
    const legendEntries = vis.pieLegend
      .selectAll(".legend-entry")
      .data([...vis.raceCategories].reverse())
      .join("g")
      .attr("class", "legend-entry")
      .attr("transform", (d, i) => `translate(0, ${i * swatchSpacing + 20})`);

    // Append swatches
    legendEntries
      .append("rect")
      .attr("x", 10)
      .attr("width", swatchSize)
      .attr("height", swatchSize)
      .attr("fill", (d) => vis.pieColourScale(d))
      .attr("stroke", "black")
      .attr("stroke-width", 0.5);

    // Append legend Labels
    legendEntries
      .append("text")
      .attr("x", swatchSize + 20)
      .attr("y", swatchSize / 2 + 4)
      .attr("font-size", "11px")
      .text((d) => d);

    // Append disclaimer
    vis.pieLegend
      .append("text")
      .attr("class", "legend-disclaimer")
      .attr("font-size", "9.5px")
      .attr("font-style", "italic")
      .attr("text-anchor", "middle")
      .attr("y", vis.config.pieLegendHeight - legendPadding * 3.5)
      .attr("x", vis.config.pieLegendWidth / 2 - legendPadding)
      .text(
        "Racial categories and data are based on the 2020 US Decennial Census"
      );
  }
}
