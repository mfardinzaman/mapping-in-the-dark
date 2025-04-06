class ChoroplethMap {
  constructor(_config, _data, _dispatcher) {
    this.config = {
      parentElement: _config.parentElement,
      containerWidth: _config.containerWidth || 1250,
      containerHeight: _config.containerHeight || 600,
      margin: _config.margin || { top: 10, right: 10, bottom: 10, left: 10 },
      tooltipPadding: 10,
      legendBottom: 10,
      legendRight: 10,
      legendRectHeight: 12,
      legendRectWidth: 150,
      colourDark: '#0e1031',
      colourLight: '#fdf6c1'
    };
    this.data = _data;
    this.dispatcher = _dispatcher;
    this.selectedFips = new Set();
    this.selectByCounty = true;

    // TODO: currently turned off interaction with choropleth to reduce lag, add it back later
    // this.dispatcher.on('timeRangeChanged.choropleth', ({ startDate, endDate }) => {
    //   this.selectedStartDate = startDate;
    //   this.selectedEndDate = endDate;
    //   this.updateVis();
    // });

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
    vis.projection = d3.geoAlbersUsa();
    vis.geoPath = d3.geoPath().projection(vis.projection);

    vis.colourScale = d3.scaleSymlog()
      .range([vis.config.colourLight, vis.config.colourDark])
      .interpolate(d3.interpolateHcl);

    // Initialize linear gradient for legend
    vis.linearGradient = vis.svg.append('defs').append('linearGradient')
      .attr('id', 'legend-gradient');

    // Invisible rectangle to reset county selection
    vis.chart.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', vis.config.width)
      .attr('height', vis.config.height)
      .attr('fill', 'transparent')
      .on('click', (event) => {
        vis.dispatcher.call('resetCounty', event)
      });

    // Append legend
    vis.legend = vis.svg.append('g')
      .attr('class', 'legend')
      .attr(
        'transform',
        `translate(
          ${vis.config.width - vis.config.legendRight - vis.config.legendRectWidth},
          ${vis.config.height - vis.config.legendBottom}
        )`
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
          .text('- Outages per person')
      });

    vis.updateVis();
  }

  updateVis() {
    const vis = this;

    // Value accessors
    vis.colourValue = d => {
      const start = vis.selectedStartDate;
      const end = vis.selectedEndDate;

      if (!d.properties.outage_data) return 0;

      // Cache outage data
      d.properties.cache ??= {};

      const startKey = start?.toISOString() ?? 'null';
      const endKey = end?.toISOString() ?? 'null';
      const key = `${startKey}_${endKey}`;

      if (!(key in d.properties.cache)) {
        let sum;

        if (!start && !end) {
          sum = d.properties.sum_outage_count ?? d3.sum(d.properties.outage_data, o => o.outage_count);
        } else {
          const filtered = d.properties.outage_data.filter(o => {
            const oDate = new Date(o.date);
            return oDate >= start && oDate <= end;
          });
          sum = d3.sum(filtered, o => o.outage_count);
        }
        d.properties.cache[key] = sum;
      }

      const pop = d.properties.pop_2023;
      return pop > 0 ? d.properties.cache[key] / pop : 0;
    };

    vis.data.features.forEach(d => {
      d.properties.cachedColorValue = vis.colourValue(d);
    });

    // Update colour scale
    const outageExtent = d3.extent(vis.data.features, d => d.properties.cachedColorValue);
    vis.colourScale.domain(outageExtent);

    // Define gradient stops
    const legendStops = d3.range(outageExtent[0], Math.sqrt(outageExtent[1]), Math.sqrt(outageExtent[1] / 5))
      .map(d => d ** 2);

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

    vis.countyPaths = vis.chart.selectAll('.county')
        .data(vis.data.features, d => d.properties.fips_code)
      .join('path')
        .attr('id', d => `fips-${d.properties.fips_code}`)
        .attr('class', d => `county state-${d.properties.state_abbr}`)
        .classed('county-selected', d => d.properties.selected)
        .attr('d', vis.geoPath)
        .on('mousemove', function (event, d) {
          d3.select(this).classed('county-hover', true);
          if (!vis.selectByCounty) {
            d3.selectAll(`.state-${d.properties.state_abbr}`).classed('county-hover', true);
          }

          const format = d3.format(",");
          const outages = `<strong>${format(d.properties.sum_outage_count)}</strong> outages`;
          const population = `<strong>${format(d.properties.pop_2023)}</strong> people`;

          d3.select('#tooltip')
            .style('display', 'block')
            .style('left', `${event.pageX + vis.config.tooltipPadding}px`)
            .style('top', `${event.pageY + vis.config.tooltipPadding}px`)
            .html(`
            <div class="tooltip-title"><strong>${d.properties.county} County</strong>, ${d.properties.state_abbr}</div>
            <div>${outages}</div>
            <div>${population}</div>`);
        })
        .on('mouseleave', function (event, d) {
          d3.select(this).classed('county-hover', false);
          if (!vis.selectByCounty) {
            d3.selectAll(`.state-${d.properties.state_abbr}`).classed('county-hover', false);
          }

          d3.select('#tooltip').style('display', 'none');
        })
        .on('click', function (event, d) {
          d.properties.selected = !d.properties.selected;
          let counties = [d];

          if (!vis.selectByCounty) {
            counties = vis.data.features.filter(f => f.properties.state_abbr === d.properties.state_abbr);
          }

          counties.forEach(c => {
            c.properties.selected = d.properties.selected;
            if (c.properties.selected) {
              vis.selectedFips.add(c.properties.fips_code);
            } else {
              vis.selectedFips.delete(c.properties.fips_code);
            }
          });

          vis.dispatcher.call('selectCounty', event, vis.selectedFips);
        });

    // Append map
    vis.countyPaths.each(function (d) {
      const newFill = vis.colourScale(d.properties.cachedColorValue);
      if (d.properties.lastFill !== newFill) {
        d3.select(this)
          .transition().duration(200)
          .attr('fill', newFill);
        d.properties.lastFill = newFill;
      }

      d3.select(this).classed('county-selected', d.properties.selected);
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
      .text(d => Math.round(d));

    // Update gradient legend
    vis.linearGradient.selectAll('stop')
      .data(vis.legendStops)
      .join('stop')
      .attr('offset', d => `${d.offset}%`)
      .attr('stop-color', d => d.colour);

    vis.legendRect.attr('fill', 'url(#legend-gradient)');
  }
}