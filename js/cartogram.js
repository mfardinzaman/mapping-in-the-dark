class Cartogram {
  /**
   * Class constructor with initial configuration
   * @param {Object}
   * @param {Array}
   * @param {Array}
   */
  constructor(_config, _data, _demographicData, _raceCategories, _dispatcher) {
    this.config = {
      parentElement: _config.parentElement,
      containerWidth: 1480,
      containerHeight: 700,
      margin: { top: 120, right: 20, bottom: 20, left: 10 },
      minSquareSize: 70,
      maxSquareSize: 150,
      squareSpacing: 80,
      tileColourLegendBottom: 5,
      tileColourLegendLeft: 450,
      tileColourLegendRectHeight: 12,
      tileColourLegendRectWidth: 500,
      startingMapCoordinate: 350,
      numBins: 11,
      tooltipPadding: 10,
      tileSizeLegendBottom: 120,
      tileSizeLegendLeft: 15,
      tileSizeLegendHeight: 230,
      tileSizeLegendWidth: 300,
      pieLegendBottom: 390,
      pieLegendLeft: 30,
      pieLegendHeight: 190,
      pieLegendWidth: 300,
    };
    this.data = _data;
    this.demographicData = _demographicData;
    this.raceCategories = _raceCategories;
    this.dispatcher = _dispatcher;

    this.dispatcher.on(
      "timeRangeChanged.cartogram",
      ({ startDate, endDate }) => {
        if (isMapView) return;
        this.selectedStartDate = startDate;
        this.selectedEndDate = endDate;
        this.updateVis();
      }
    );

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
      .attr("height", containerHeight);

    vis.mainGroup = vis.svg
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Add background rect
    vis.mainGroup
      .append("rect")
      .attr("class", "background-rect")
      .attr("x", -vis.config.margin.left)
      .attr("y", -vis.config.margin.top)
      .attr("width", vis.config.containerWidth)
      .attr("height", vis.config.containerHeight)
      .attr("rx", 15)
      .attr("fill", "rgb(152, 173, 194)");

    // Adds tile size scaling based on population density
    vis.tileSizeScale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([minSquareSize, maxSquareSize]);

    // Create a group for the tile grid
    vis.tileGrid = vis.mainGroup.append("g").attr("class", "tile-grid");

    // empty group for disclaimers
    vis.cartogramDisclaimer = vis.mainGroup
      .append("g")
      .attr("class", "cartogram-disclaimer")
      .attr("transform", `translate(${20}, ${0})`);

    // Empty group for the tile colour legend
    vis.tileColourLegend = vis.mainGroup
      .append("g")
      .attr("class", "legend")
      .attr(
        "transform",
        `translate(${vis.config.tileColourLegendLeft}, ${vis.config.tileColourLegendBottom})`
      );

    // Empty group for the tile size legend
    vis.tileSizeLegend = vis.svg
      .append("g")
      .attr("class", "tile-size-legend")
      .attr(
        "transform",
        `translate(${vis.config.tileSizeLegendLeft}, ${vis.config.tileSizeLegendBottom})`
      );

    // Empty group for pie chart legend
    vis.pieLegend = vis.mainGroup
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
      .outerRadius(minSquareSize * 0.3);

    vis.updateVis();
    vis.renderCartogramDisclaimer();
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
    let filteredData;
    if (this.selectedStartDate) {
      const start = vis.selectedStartDate;
      const end = vis.selectedEndDate;

      filteredData = vis.data.filter((item) => {
        return start <= item.date && item.date <= end;
      });
      if (filteredData.length === 0) filteredData = vis.data;
    } else {
      filteredData = vis.data;
    }

    const { squareSpacing } = vis.config;
    const groupedData = d3.groups(filteredData, (d) => d.State);

    // Calculate the average value for each state
    const averagedData = Array.from(groupedData, ([State, values]) => {
      const proportionAffected = d3.mean(values, (d) => d.proportionAffected);
      return { State, proportionAffected };
    });

    // combine datasets to get the cartogram data
    vis.cartogramData = averagedData.map((d1, index) => ({
      ...d1,
      ...vis.demographicData[index],
    }));

    // Calculate x-coordinate for each State
    let currentX = -1;
    let currentXCoord = -1;
    let currentMaxX = vis.config.startingMapCoordinate;

    vis.cartogramData.forEach((d) => {
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

    vis.cartogramData.forEach((d) => {
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
    vis.cartogramData.forEach((d) => {
      let currentData = vis.cartogramData.filter(
        (filtered) => filtered.x == d.x
      );
      let currentMax = d3.max(currentData, (f) => f.proportionAffected);
      if (currentMax != d.proportionAffected) {
        d.xCoord =
          d.xCoord +
          (vis.tileSizeScale(currentMax) -
            vis.tileSizeScale(d.proportionAffected)) /
            2;
      }
    });

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
      .data(vis.cartogramData)
      .join("rect")
      .attr("x", (d) => d.xCoord)
      .attr("y", (d) => d.yCoord)
      .attr("width", (d) => vis.tileSizeScale(d.proportionAffected))
      .attr("height", (d) => vis.tileSizeScale(d.proportionAffected))
      .attr("fill", (d) => {
        return vis.gridColourScale(d.proportionNonWhite);
      })
      .attr("stroke", "slate-grey")
      .attr("stroke-width", 1)
      .on("mousemove", function (event, d) {
        d3.select(this).classed("tile-hover", true);
        d3
          .select("#tooltip")
          .style("display", "block")
          .style("left", `${event.pageX + vis.config.tooltipPadding}px`)
          .style(
            "top",
            event.pageY - vis.config.tooltipPadding - 220 + "px"
          ).html(`
            <div class="tooltip-title"><strong>${d.State}</strong></div>
            <div><i>Population affected by outages: ${Math.round(
              d.proportionAffected
            )}%</i></div>
            <br/>
            <div><strong>State-Wide Racial Distribution:</strong></div>
            <ul>
              <li>White: ${Math.round((1 - d.proportionNonWhite) * 100)}%</li>
              <li>Non-White: ${Math.round(d.proportionNonWhite * 100)}%</li>
            </ul>
            <br/>
            <div><strong>Racial Distribution of Non-White Population:</strong></div>
            <ul>
              <li>Black/African American:<strong>${Math.round(
                (d.black / d.totalNonWhite) * 100
              )}%</strong></li>
              <li>Mixed Race:<strong> ${Math.round(
                (d.mixed / d.totalNonWhite) * 100
              )}%</strong></li>
              <li>Asian:<strong>${Math.round(
                (d.asian / d.totalNonWhite) * 100
              )}%</strong></li>
              <li>Native Hawaiian/Other Pacific Islander: <strong>${Math.round(
                (d.hawaiin / d.totalNonWhite) * 100
              )}%</strong></li>
              <li>American Indian/Alaska Native: <strong>${Math.round(
                (d.indian / d.totalNonWhite) * 100
              )}%</strong></li>
              <li>Other: <strong>${Math.round(
                (d.other / d.totalNonWhite) * 100
              )}%</strong></li>
            </ul>
          `);
      })
      .on("mouseleave", function (event, d) {
        d3.select(this).classed("tile-hover", false);
        d3.select("#tooltip").style("display", "none");
      });

    // Create pie charts
    const pieCharts = vis.tileGrid
      .selectAll(".pie-chart")
      .data(vis.cartogramData)
      .join("g")
      .attr("class", "pie-chart")
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
      .style("stroke-width", "0.75px")
      .on("mousemove", function (event, d) {
        const format = d3.format(",");

        d3.select(this).classed("piechart-hover", true);
        d3
          .select("#tooltip")
          .style("display", "block")
          .style("left", `${event.pageX + vis.config.tooltipPadding}px`)
          .style("top", event.pageY + vis.config.tooltipPadding + "px").html(`
            <div class="tooltip-title"><strong>${d.data.race}</strong>: ${format(d.value)} people</div>
          `);
      })
      .on("mouseleave", function (event, d) {
        d3.select(this).classed("piechart-hover", false);
        d3.select("#tooltip").style("display", "none");
      });

    vis.tileGrid
      .selectAll("text")
      .data(vis.cartogramData)
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
   * Initialize and render legends
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

    // Generate text labels for tile color legend bins - code adapted from chatGPT
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
    vis.tileSizeLegend
      .append("rect")
      .attr("x", vis.config.tileSizeLegendLeft)
      .attr("y", vis.config.tileSizeLegendBottom)
      .attr("width", vis.config.tileSizeLegendWidth)
      .attr("height", vis.config.tileSizeLegendHeight)
      .attr("fill", "rgb(201, 211, 221)")
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
      .attr("x", vis.config.tileSizeLegendLeft + spacing)
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
      .attr("x", vis.config.tileSizeLegendLeft + spacing * 6)
      .attr("y", vis.config.tileSizeLegendBottom + spacing * 1.7)
      .text("Avg affected population in selected date range");

    vis.tileSizeLegend
      .append("text")
      .attr("class", "legend-disclaimer-2")
      .attr("font-size", "9.5px")
      .attr("font-style", "italic")
      .attr("text-anchor", "middle")
      .attr("x", vis.config.tileSizeLegendLeft + spacing * 6)
      .attr("y", vis.config.tileSizeLegendBottom + spacing * 2.2)
      .text("normalized by 2020 state population");

    // Starting position for the largest square
    const startX = vis.config.tileSizeLegendLeft + spacing * 3;
    const startY = vis.config.tileSizeLegendBottom + spacing * 2.6;

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
        .attr("fill", "white")
        .attr("opacity", 0.6)
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
        .text(value <= 1 ? "≤1%" : `${value}%`);

      // Add connecting lines with bends for 1% and 5%
      // Code to create bent lines adapted from chatGPT
      let bendXOffset = -3;
      if (value === 1) bendXOffset = -6;
      if (value === 1 || value === 5) {
        // Create path with horizontal and vertical segments for bent line
        vis.tileSizeLegend
          .append("path")
          .attr("d", () => {
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
      .attr("fill", "rgb(201, 211, 221)") // TODO - or white
      .attr("stroke", "grey")
      .attr("stroke-width", 1)
      .attr("rx", 10)
      .attr("ry", 10);

    // legend title
    vis.pieLegend
      .append("text")
      .attr("class", "pie-legend-title")
      .attr("x", vis.config.pieLegendWidth / 2 - legendPadding)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text("Pie Chart Legend");

    // legend subtitle
    vis.pieLegend
      .append("text")
      .attr("class", "pie-legend-subtitle")
      .attr("x", vis.config.pieLegendWidth / 2 - legendPadding)
      .attr("y", legendPadding + 5)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text("Racial Distribution of Non-White Population");

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
      .attr("x", legendPadding)
      .attr("y", legendPadding)
      .attr("width", swatchSize)
      .attr("height", swatchSize)
      .attr("fill", (d) => vis.pieColourScale(d))
      .attr("stroke", "black")
      .attr("stroke-width", 0.5);

    // Append legend Labels
    legendEntries
      .append("text")
      .attr("x", legendPadding + swatchSize + 20)
      .attr("y", legendPadding + swatchSize / 2 + 4)
      .attr("font-size", "11px")
      .text((d) => d);
  }

  renderCartogramDisclaimer() {
    let vis = this;
    const disclaimerHeight = 190;
    const disclaimerWidth = vis.config.tileSizeLegendWidth;
    const xOffset = 15;
    let yOffset = -70;

    const lineHeight = 18;
    const maxLineWidth = disclaimerWidth - 30;

    vis.cartogramDisclaimer
      .append("rect")
      .attr("class", "cartogram-disclaimer-background")
      .attr("y", -90)
      .attr("width", disclaimerWidth)
      .attr("height", disclaimerHeight)
      .attr("fill", "rgb(201, 211, 221)")
      .attr("stroke", "grey")
      .attr("stroke-width", 1)
      .attr("rx", 10)
      .attr("ry", 10);

    // Add title
    vis.cartogramDisclaimer
      .append("text")
      .attr("x", xOffset)
      .attr("y", yOffset)
      .attr("font-size", "15px")
      .attr("font-weight", "bold")
      .attr("fill", "purple")
      .text("Disclaimers:");

    yOffset += 20; // add space between title and points

    // Add disclaimer items
    const disclaimers = [
      "Cartogram displays 2020 average by default",
      "In timeline, date ranges outside of 2020 cannot be selected",
      "Racial data reflects state-wide racial distribution in 2020, not distribution of people directly affected by outages",
      "Racial categories and data are derived from the 2020 US Decennial Census",
    ];

    // Wrap text (adapted from chatGPT)
    const wrapText = (text, x, y, prefix = "") => {
      const words = text.split(/\s+/);
      let line = [];
      let tspanCount = 0;

      const textEl = vis.cartogramDisclaimer
        .append("text")
        .attr("x", x)
        .attr("y", y)
        .attr("font-size", "13px")
        .attr("fill", "black");

      let tspan = textEl
        .append("tspan")
        .attr("x", x)
        .attr("dy", 0)
        .text(prefix);

      words.forEach((word) => {
        line.push(word);
        tspan.text(prefix + line.join(" "));
        if (tspan.node().getComputedTextLength() > maxLineWidth) {
          line.pop();
          tspan.text(prefix + line.join(" "));
          line = [word];
          prefix = ""; // no bullet on wrapped lines
          tspan = textEl
            .append("tspan")
            .attr("x", x)
            .attr("dy", lineHeight)
            .text(word);
          tspanCount++;
        }
      });

      if (line.length && tspan.text() !== prefix + line.join(" ")) {
        tspan = textEl
          .append("tspan")
          .attr("x", x)
          .attr("dy", lineHeight)
          .text(prefix + line.join(" "));
        tspanCount++;
      }

      return (tspanCount + 1) * lineHeight;
    };

    // Render each disclaimer item
    disclaimers.forEach((text) => {
      const heightAdded = wrapText(text, xOffset, yOffset, "• ");
      yOffset += heightAdded + 4;
    });
  }
}
