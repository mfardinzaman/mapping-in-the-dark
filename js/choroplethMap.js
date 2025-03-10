class ChoroplethMap {
  constructor(_config, _data) {
    this.config = {
      parentElement: _config.parentElement,
      containerWidth: _config.containerWidth || 500,
      containerHeight: _config.containerHeight || 400,
      margin: _config.margin || { top: 10, right: 10, bottom: 10, left: 10 },
      tooltipPadding: 10,
      legendBottom: 10,
      legendLeft: 10,
      legendRectHeight: 12, 
      legendRectWidth: 150,
      colourDark: '#0e1031',
      colourLight: '#fdf6c1'
    }
    this.data = _data;

    this.initVis();
  }

  initVis() {
    const vis = this;

    // Calculate inner chart size
    vis.config.width =
      vis.config.containerWidth -
      vis.config.margin.right -
      vis.config.margin.left;
    vis.config.height =
      vis.config.containerHeight -
      vis.config.margin.top -
      vis.config.margin.bottom;

    // Define SVG drawing area
    vis.svg = d3.select(vis.config.parentElement).append('svg')
      .attr('width', vis.config.containerWidth)
      .attr('height', vis.config.containerHeight);

    // Append group element and translate
    vis.chart = vis.svg.append("g").attr(
      "transform",
      `translate(${vis.config.margin.top}, ${vis.config.margin.left})`
    );

    // Initialize projection and path generator
    vis.projection = d3.geoAlbersUsa()
    vis.geoPath = d3.geoPath().projection(vis.projection);

    vis.colourScale = d3.scaleSqrt()
      .range([vis.config.colourLight, vis.config.colourDark])
      .interpolate(d3.interpolateHcl);

    // Initialize linear gradient for legend
    vis.linearGradient = vis.svg.append('defs').append('linearGradient')
      .attr('id', 'legend-gradient');

    // Append legend
    vis.legend = vis.svg.append('g')
      .attr('class', 'legend')
      .attr(
        'transform',
        `translate(${vis.config.legendLeft}, ${vis.config.height - vis.config.legendBottom})`
      );

    vis.legendRect = vis.legend.append('rect')
      .attr('width', vis.config.legendRectWidth)
      .attr('height', vis.config.legendRectHeight);

    vis.legendTitle = vis.legend.append('text')
      .attr('class', 'legend-title')
      .attr('dy', '.35em')
      .attr('y', -10)
      .call(t => {
        t.append('tspan')
          .attr('font-weight', 'bold')
          .text('Legend');

        t.append('tspan')
          .attr('dx', 4)
          .text('- Number of outages')
      });

    vis.updateVis();
  }

  updateVis() {
    const vis = this;

    // Update colour scale
    const outageExtent = d3.extent(vis.data.features, d => d.properties.sum_outage_count)
    vis.colourScale.domain(outageExtent);

    // Define gradient stops
    const legendStops = [0, 1, 10, 100, 1000, 10000, 50000, 218354];
    
    // Choose representative values
    vis.legendStops = legendStops.map(d => {
      return {
        colour: vis.colourScale(d),
        value: d,
        offset: d / outageExtent[1] * 100
      };
    });

    vis.renderVis();
  }

  renderVis() {
    const vis = this;

    // Define scale of projection
    vis.projection.fitSize([vis.config.width, vis.config.height], vis.data);

    // Append map
    const countyPath = vis.chart.selectAll('.county')
        .data(vis.data.features)
      .join('path')
        .attr('class', 'county')
        .attr('d', vis.geoPath)
        .attr('fill', d => vis.colourScale(d.properties.sum_outage_count));

    countyPath.on('mousemove', (event, d) => {
      const outages = `<strong>${d.properties.sum_outage_count}</strong> outages`;
      
      d3.select('#tooltip')
        .style('display', 'block')
        .style('left', `${event.pageX + vis.config.tooltipPadding}px`)
        .style('top', `${event.pageY + vis.config.tooltipPadding}px`)
        .html(`
          <div class="tooltip-title">${d.properties.county} County</div>
          <div>${outages}</div>`)
    });

    countyPath.on('mouseleave', () => {
      d3.select('#tooltip').style('display', 'none');
    });

    // Add legend labels
    vis.legend.selectAll('.legend-label')
        .data(vis.colourScale.domain())
      .join('text')
        .attr('class', 'legend-label')
        .attr('text-anchor', 'middle')
        .attr('dy', '.35em')
        .attr('y', 20)
        .attr('x', (d, i) => {
          return i == 0 ? 0 : vis.config.legendRectWidth;
        })
        .text(d => d);

    // Update gradient legend
    vis.linearGradient.selectAll('stop')
        .data(vis.legendStops)
      .join('stop')
        .attr('offset', d => `${d.offset}%`)
        .attr('stop-color', d => d.colour);

    vis.legendRect.attr('fill', 'url(#legend-gradient)');
  }
}