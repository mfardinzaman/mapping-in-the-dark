class TimeLine {
  constructor(_config, _data, _dispatcher) {
    this.config = {
      parentElement: _config.parentElement,
      containerWidth: _config.containerWidth || 1250,
      containerHeight: _config.containerHeight || 140,
      margin: _config.margin || { top: 10, right: 5, bottom: 50, left: 50 },
      tooltipPadding: 10,
      gradientColours: ["#0e1031", "#fdf6c1"],
    };
    this.data = _data;
    this.dispatcher = _dispatcher;
    this.selectedFips = new Set();

    this.initVis();
  }

  initVis() {
    let vis = this;
    vis.config.titlePadding = 30;

    vis.width =
      vis.config.containerWidth -
      vis.config.margin.left -
      vis.config.margin.right;
    vis.height =
      vis.config.containerHeight -
      vis.config.margin.top -
      vis.config.margin.bottom;

    vis.svg = d3
      .select(vis.config.parentElement)
      .append("svg")
      .attr("width", vis.config.containerWidth)
      .attr("height", vis.config.containerHeight + vis.config.titlePadding);

    // Add background rect:
    vis.svg
      .append("rect")
      .attr("class", "background-rect")
      .attr("width", vis.config.containerWidth)
      .attr("height", vis.config.containerHeight + vis.config.titlePadding)
      .attr("rx", 15)
      .attr("fill", "rgb(152, 173, 194)");

    vis.chart = vis.svg
      .append("g")
      .attr(
        "transform",
        `translate(${vis.config.margin.left}, ${vis.config.margin.top + vis.config.titlePadding
        })`
      );

    vis.format = d3.format(",");

    vis.xScale = d3.scaleTime().range([0, vis.width]);

    vis.xAxis = d3
      .axisBottom(vis.xScale)
      .tickFormat(d3.timeFormat("%b"))
      .tickSize(0)
      .tickSizeOuter(0)
      .tickPadding(7);

    vis.xAxisGroup = vis.chart
      .append("g")
      .attr("class", "axis x-axis")
      .attr("transform", `translate(0, ${vis.height})`);

    vis.yScale = d3.scaleLinear().range([vis.height, 5]);

    vis.yAxis = d3
      .axisLeft(vis.yScale)
      .ticks(5)
      .tickSize(-vis.width)
      .tickSizeOuter(0);

    vis.yAxisGroup = vis.chart.append("g").attr("class", "axis y-axis");

    // Tooltip indicator
    vis.hoverLine = vis.chart
      .append("line")
      .attr("class", "hover-line")
      .style("pointer-events", "none")
      .style("display", "none");

    // ==========================================
    // Gradient
    // ==========================================
    const colourScale = d3
      .scaleSymlog()
      .range(vis.config.gradientColours)
      .domain([0, 1])
      .interpolate(d3.interpolateHcl);

    const gradOffsets = d3
      .range(0, Math.sqrt(1), Math.sqrt(1 / 5))
      .map((d) => d ** 2);

    const gradStops = gradOffsets.map((d) => {
      return {
        colour: colourScale(d),
        value: d,
        offset: d * 100,
      };
    });

    vis.linearGradient = vis.svg
      .append("defs")
      .append("linearGradient")
      .attr("id", "timeline-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    vis.linearGradient
      .selectAll("stop")
      .data(gradStops)
      .join("stop")
      .attr("offset", (d) => `${d.offset}%`)
      .attr("stop-color", (d) => d.colour)
      .attr("stop-opacity", "80%");

    // ==========================================
    // Brush
    // ==========================================
    // Add brush
    vis.brush = d3
      .brushX()
      .extent([
        [0, 0],
        [vis.width, vis.height],
      ])
      .on("end", (event) => {
        const selection = event.selection;

        if (selection) {
          const [x0, x1] = selection;
          const startDate = vis.xScale.invert(x0);
          const endDate = vis.xScale.invert(x1);

          if (vis.dispatcher) {
            vis.dispatcher.call("timeRangeChanged", null, {
              startDate,
              endDate,
            });
          }
        } else {
          if (vis.dispatcher) {
            vis.dispatcher.call("timeRangeChanged", null, {
              startDate: null,
              endDate: null,
            });
          }
        }
      });

    vis.brushGroup = vis.chart
      .append("g")
      .attr("class", "brush")
      .call(vis.brush);

    // Add chart title
    vis.svg
      .append("text")
      .attr("class", "chart-title")
      .attr("y", 30)
      .attr("x", 20)
      .attr("font-size", "18px")
      .attr("font-weight", "bold")
      .text("Timeline of Total Power Outages");

    vis.updateVis();
  }

  updateVis() {
    let vis = this;

    vis.xVal = (d) => d.date;
    vis.yVal = (d) => d.total;

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    let fData = vis.data.filter((d) => vis.selectedFips.has(d.fips_code));
    if (fData.length === 0) fData = vis.data;

    const nestedData = d3
      .groups(fData, (d) => d.year)
      .map(([year, arr]) => {
        const byMonth = d3.rollup(
          arr,
          (v) => d3.sum(v, (d) => d.outage_count),
          (d) => d.month
        );

        const monthsArray = Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          monthName: monthNames[i],
          total: byMonth.get(i + 1) || 0,
          year,
        }));

        return { year, months: monthsArray };
      });

    const allMonths = nestedData.flatMap((d) =>
      d.months.map((m) => ({
        ...m,
        date: new Date(m.year, m.month - 1),
      }))
    );

    const extent = d3.extent(allMonths, (d) => d.date);
    const lastDate = new Date(extent[1]);
    lastDate.setMonth(lastDate.getMonth());

    vis.xScale.domain(extent);

    const maxOutage = d3.max(allMonths, (d) => d.total);
    vis.yScale.domain([0, maxOutage]);

    vis.nestedData = nestedData;

    vis.area = d3
      .area()
      .x((d) => vis.xScale(vis.xVal(d)))
      .y0(vis.yScale(0))
      .y1((d) => vis.yScale(vis.yVal(d)));

    vis.bisect = d3.bisector((d) => vis.xVal(d)).left;

    vis.bisect = d3.bisector((d) => vis.xVal(d)).left;

    vis.renderVis();
  }

  renderVis() {
    let vis = this;

    const flatData = vis.nestedData.flatMap((d) =>
      d.months.map((m) => ({
        ...m,
        date: new Date(m.year, m.month - 1),
      }))
    );

    const chartArea = vis.chart
      .selectAll(".outage-area")
      .data([flatData], (d) => d.date)
      .join("path")
      .attr("class", "outage-area")
      .on("mousemove", function (event) {
        const leftOffset =
          vis.svg.node().getBoundingClientRect().left +
          vis.config.margin.left +
          vis.config.tooltipPadding;

        const xPos = d3.pointer(event, this)[0],
          date = vis.xScale.invert(xPos),
          i = vis.bisect(flatData, date, 1),
          d0 = flatData[i - 1],
          d1 = flatData[i],
          d = xPos - vis.xScale(d0.date) > vis.xScale(d1.date) - xPos ? d1 : d0;

        d3.select("#tooltip")
          .style("display", "block")
          .style("left", `${vis.xScale(vis.xVal(d)) + leftOffset}px`)
          .style("top", `${event.pageY - vis.config.tooltipPadding}px`)
          .html(
            `<div class="tooltip-title"><strong>${d.monthName} ${d.year
            }</strong>: ${vis.format(d.total)} outages</div>`
          );

        vis.hoverLine
          .raise()
          .style("display", "block")
          .attr("x1", vis.xScale(vis.xVal(d)))
          .attr("x2", vis.xScale(vis.xVal(d)))
          .attr("y1", vis.height)
          .attr("y2", vis.yScale(vis.yVal(d)));
      })
      .on("mouseleave", () => {
        d3.select("#tooltip").style("display", "none");
        vis.hoverLine.style("display", "none");
      });

    chartArea
      .transition()
      .duration(200)
      .attr("d", vis.area)
      .attr("fill", "url(#timeline-gradient)");

    // Year Labels
    vis.xAxisGroup
      .selectAll(".year-label")
      .data(vis.nestedData)
      .join("text")
      .attr("class", "year-label")
      .attr("x", (d) => {
        const firstDate = new Date(d.year, d.months[0].month - 1);
        const lastDate = new Date(d.year, d.months[d.months.length - 1].month);
        return (vis.xScale(firstDate) + vis.xScale(lastDate)) / 2;
      })
      .attr("y", 35)
      .attr("text-anchor", "middle")
      .text((d) => d.year)
      .attr("font-size", "16px")
      .transition()
      .duration(300)
      .attr("fill", (d) => (!isMapView && d.year !== 2020 ? "#777" : "black"))
      .style("opacity", (d) => (!isMapView && d.year !== 2020 ? 0.4 : 1));


    vis.xAxisGroup.call(vis.xAxis).call((g) => {
      g.select(".domain").remove();

      g.selectAll(".tick text")
        .transition()
        .duration(300)
        .style("fill", (d) => (!isMapView && d.getFullYear() !== 2020 ? "#777" : "black"))
        .style("opacity", (d) => (!isMapView && d.getFullYear() !== 2020 ? 0.4 : 1));
    });
    // Overlay for disabled months
    vis.chart.selectAll('.disabled-overlay').remove();

    if (isMapView) {
      return;
    }

    if (!isMapView) {
      const jan2020 = new Date(2020, 0);
      const dec2020 = new Date(2020, 11, 31);

      const xJan = vis.xScale(jan2020);
      const xDec = vis.xScale(dec2020);

      vis.chart.append('rect')
        .attr('class', 'disabled-overlay')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', xJan)
        .attr('height', vis.height)
        .style('fill', 'rgba(150, 150, 150, 0.5)')
        .style('opacity', 0)
        .style('cursor', 'not-allowed')
        .transition()
        .duration(400)
        .style('opacity', 0.5);

      vis.chart.append('rect')
        .attr('class', 'disabled-overlay')   
        .attr('x', xDec)
        .attr('y', 0)
        .attr('width', vis.width - xDec)
        .attr('height', vis.height)
        .style('fill', 'rgba(150, 150, 150, 0.5)')
        .style('opacity', 0)
        .style('cursor', 'not-allowed')
        .transition()
        .duration(400)
        .style('opacity', 1);
    }

  }
}