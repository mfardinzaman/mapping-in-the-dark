class Cartogram {

  /**
   * Class constructor with initial configuration
   * @param {Object}
   * @param {Array}
   * @param {Array}
   */
  constructor(_config, _data, _raceColours) {
    this.config = {
      parentElement: _config.parentElement,
      containerWidth: 2000,
      containerHeight: 2000,
      margin: { top: 120, right: 20, bottom: 20, left: 45 },
      // M4? or M3 TODO: change square sizes and square spacing depending on size of the visualization
      minSquareSize: 70,
      maxSquareSize: 150,
      squareSpacing: 80
    }
    this.data = _data;
    this.raceColours = _raceColours;
    this.initVis();
  }

  /**
   * We initialize the arc generator, scales, axes, and append static elements
   */
  initVis() {
    let vis = this;
    const { containerWidth, containerHeight, margin, minSquareSize, maxSquareSize } = vis.config;

    // Set up the SVG container
    vis.svg = d3.select(vis.config.parentElement)
      .append('svg')
      .attr('width', containerWidth)
      .attr('height', containerHeight)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Adds tile size scaling based on population density
    // M4? or M3 TODO: change scaling depending on data? May want to use a scale other than square root
    // M3 TODO: also change all instances of total population (d.total) to population density
    vis.tileSizeScale = d3.scaleSqrt()
      .domain([d3.min(vis.data, d => d.total), d3.max(vis.data, d => d.total)])
      .range([minSquareSize, maxSquareSize]);

    // Create a group for the tile grid
    vis.tileGrid = vis.svg.append('g')
      .attr('class', 'tile-grid');

    // create categorical colour scale for pie chart
    vis.colourScale = d3.scaleOrdinal()
      .domain(Object.keys(vis.raceColours))
      .range(Object.values(vis.raceColours));

    // create pie chart generator
    vis.pieGenerator = d3.pie()
      .value(d => d.value)
      .startAngle(0)
      .endAngle(2 * Math.PI);

    // create arc for each segment in pie chart
    vis.arcGenerator = d3.arc()
      .innerRadius(0)
      // M4? or M3 TODO: Change sizes of pie charts
      .outerRadius(minSquareSize * 0.4);

    // M4 TODO: Add tooltips for pie charts/tilegrid

    vis.updateVis();
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

    vis.data.forEach(d => {
      // if X-coordinate is the same, get the max tile size of the column
      if (currentX == d.x) {
        if (vis.tileSizeScale(d.total) > currentMaxX) {
          currentMaxX = vis.tileSizeScale(d.total);
        }
      } else {
        // otherwise, get the new X-coordinate for the next column
        currentXCoord = currentXCoord + currentMaxX;
        currentX = d.x;
        currentMaxX = vis.tileSizeScale(d.total);
      }
      d.xCoord = currentXCoord;
    });

    // Calculate y-coordinate for each State
    let currentY = -1;
    let currentYCoord = -1;
    let nextYCoord = -1;
    // TODO (optional): refactor this to calculate both x-coordinate and y-coordinate in 1 loop instead of 2
    vis.data.forEach(d => {
      // check if tile is in the same column 
      // if tiles aren't adjacent to eachother, place new tile based on y value and spacing
      // otherwise ignore conditional statements and place new tile vertically below previous tile
      currentY += 1;
      if (currentX == d.x & currentY != d.y) {
        nextYCoord = d.y * squareSpacing;
      } else if (currentX != d.x) {
        // if tile is in new column, place new tile based on y value and spacing
        nextYCoord = d.y * squareSpacing;
        currentY = d.y;
        currentX = d.x;
      }
      currentYCoord = nextYCoord;
      nextYCoord = currentYCoord + vis.tileSizeScale(d.total);
      d.yCoord = currentYCoord;
    });

    // Center align x-coordinates
    vis.data.forEach(d => {
      let currentData = vis.data.filter(filtered => filtered.x == d.x);
      let currentMax = d3.max(currentData, f => f.total);
      if (currentMax != d.total) {
        d.xCoord = d.xCoord + (vis.tileSizeScale(currentMax) - vis.tileSizeScale(d.total)) / 2;
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
    vis.tileGrid.selectAll('rect')
      .data(vis.data)
      .join('rect')
      .attr('x', d => d.xCoord)
      .attr('y', d => d.yCoord)
      .attr('width', d => vis.tileSizeScale(d.total))
      .attr('height', d => vis.tileSizeScale(d.total))
      // M3 TODO: change fill based on racial data
      .attr('fill', '#69b3a2')
      .attr('stroke', 'white')
      .attr('stroke-width', 1);

    // Create pie charts
    vis.tileGrid.selectAll('pie-chart')
      .data(vis.data)
      .join('g')
      .attr('transform', d => `translate(${d.xCoord + vis.tileSizeScale(d.total) / 2},${d.yCoord + vis.tileSizeScale(d.total) / 2})`)
      .selectAll('path')
      .data(d => vis.pieGenerator(d.pieData))
      .join('path')
      .attr('d', vis.arcGenerator)
      .attr('fill', d => vis.colourScale(d.data.race))
      .style("stroke", "white")
      .style("stroke-width", "2px")
      .style("opacity", 0.7);

    // Add text for each State
    vis.tileGrid.selectAll('text')
      .data(vis.data)
      .join('text')
      .attr('x', d => d.xCoord + vis.tileSizeScale(d.total) / 2)
      .attr('y', d => d.yCoord + vis.tileSizeScale(d.total) / 10)
      .attr('dy', '.35em')
      .attr('text-anchor', 'middle')
      .attr('fill', 'black')
      .attr('font-size', '12px')
      .text(d => d.abbr);

    // M4 TODO: Add disclaimer for racial data

    vis.renderLegend();
  }

  /**
   * Initialize and render legend
   */
  renderLegend() {
    // M4 TODO: Add a Legend
  }
}
