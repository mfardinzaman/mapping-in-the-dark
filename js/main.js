d3.csv('data/aggregated_power_outages.csv').then(data => {
    data.forEach(d => {
        d.year = +d.year;
        d.month = +d.month;
        d.outage_count = +d.outage_count;
    });


    const barChart = new BarChart(
        {
            parentElement: '#chart'
        },
        data
    );

    barChart.updateVis();
})
    .catch(error => {
        console.error('Error loading CSV data:', error);
    });
