class BarChart {
    constructor(_config, _data) {
        this.config = {
            parentElement: _config.parentElement,
            containerWidth: 1300, 
            containerHeight: 150, 
            margin: _config.margin || { top: 10, right: 10, bottom: 20, left: 30 } 
        };
        this.data = _data;
        this.initVis();
    }

    initVis() {
        let vis = this;

        vis.width = vis.config.containerWidth - vis.config.margin.left - vis.config.margin.right;
        vis.height = vis.config.containerHeight - vis.config.margin.top - vis.config.margin.bottom;

        vis.svg = d3.select(vis.config.parentElement)
            .append('svg')
            .attr('width', vis.config.containerWidth)
            .attr('height', vis.config.containerHeight);

        // Inner chart area
        vis.chart = vis.svg.append('g')
            .attr('transform', `translate(${vis.config.margin.left}, ${vis.config.margin.top})`);

        // Box outline 
        vis.chart.append('rect')
            .attr('class', 'chart-box')
            .attr('x', 0)
            .attr('y', 0) 
            .attr('width', vis.width)
            .attr('height', vis.height)
            .attr('fill', 'none')
            .attr('stroke', 'black');

        vis.xScale = d3.scaleBand()
            .range([0, vis.width])
            .paddingInner(0.2) 
            .paddingOuter(0.1); 

        vis.yScale = d3.scaleLinear().range([vis.height, 5]);

        vis.xAxisGroup = vis.chart.append('g')
            .attr('class', 'axis x-axis')
            .attr('transform', `translate(0, ${vis.height})`);

        vis.yAxisGroup = vis.chart.append('g').attr('class', 'axis y-axis');
    }

    updateVis() {
        let vis = this;

        // Group by year, sum by month
        const nestedData = d3.groups(vis.data, d => d.year).map(([year, arr]) => {
            const byMonth = d3.rollup(arr, v => d3.sum(v, d => d.outage_count), d => d.month);

            const monthsArray = Array.from({ length: 12 }, (_, i) => ({
                month: i + 1,
                total: byMonth.get(i + 1) || 0,
                year
            }));

            return { year, months: monthsArray };
        });

        const allMonths = nestedData.flatMap(d => d.months);

        vis.xScale.domain(allMonths.map(d => `${d.year}-${d.month}`));

        const maxOutage = d3.max(allMonths, d => d.total);
        vis.yScale.domain([0, maxOutage]);

        vis.nestedData = nestedData;
        vis.renderVis();
    }

    renderVis() {
        let vis = this;

        const bars = vis.chart.selectAll('.bar').data(
            vis.nestedData.flatMap(d => d.months),
            d => `${d.year}-${d.month}`
        );

        bars.enter()
            .append('rect')
            .attr('class', 'bar')
            .merge(bars)
            .attr('x', d => vis.xScale(`${d.year}-${d.month}`))
            .attr('y', d => vis.yScale(d.total)) 
            .attr('width', vis.xScale.bandwidth() * 0.5)
            .attr('height', d => vis.height - vis.yScale(d.total))
            .attr('fill', 'steelblue');

        bars.exit().remove();

        vis.xAxisGroup.selectAll('.year-label')
            .data(vis.nestedData)
            .enter()
            .append('text')
            .attr('class', 'year-label')
            .attr('x', d => {
                const months = d.months.map(m => `${m.year}-${m.month}`);
                const firstMonth = vis.xScale(months[0]);
                const lastMonth = vis.xScale(months[months.length - 1]);
                return (firstMonth + lastMonth) / 2; 
            })
            .attr('y', 20)
            .attr('text-anchor', 'middle')
            .text(d => d.year)
            .attr('fill', 'black')
            .attr('font-size', '16px');

        vis.yAxisGroup.selectAll('.tick text').remove();
    }
}
