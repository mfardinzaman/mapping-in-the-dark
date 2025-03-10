Promise.all([
    d3.json('../data/geometry_data.geojson'),
    d3.csv('../data/aggreted_power_outages_complete_no_pr.csv'),
    d3.csv('data/aggregated_power_outages.csv')
])
    .then((data) => {
        const geoData = data[0];
        const outageData = data[1];
        const outageDataForBarChart = data[2];
        outageDataForBarChart.forEach(d => {
            d.year = +d.year;
            d.month = +d.month;
            d.outage_count = +d.outage_count;
        });

        // Filter Puerto Rico
        const features = geoData.features.filter(d => d.properties.state !== 'Puerto Rico');

        // Collect outage data by fips_code
        let outageMap = {};
        outageData.forEach(d => {
            if (d.fips_code in outageMap === false) {
                outageMap[d.fips_code] = [];
            }

            outageMap[d.fips_code].push({
                date: `${d.year}-${d.month.padStart(2, "0")}`,
                outage_count: +d.outage_count,
                total_customers_out: +d.total_customers_out,
            });
        })

        features.forEach(d => {
            d.properties.fips_code = +d.properties.fips_code;
            const outage_data = outageMap[d.properties.fips_code];

            if (outage_data) {
                d.properties.outage_data = outage_data;
                d.properties.sum_outage_count = outage_data.reduce(
                    (acc, d) => {
                        return d ? acc + d.outage_count : acc;
                    },
                    0
                );
                d.properties.sum_total_customers_out = outage_data.reduce(
                    (acc, d) => {
                        return d ? acc + d.total_customers_out : acc;
                    },
                    0
                );
            } else {
                d.properties.outage_data = null;
                d.properties.sum_outage_count = null;
                d.properties.sum_total_customers_out = null;
            }
        });

        geoData.features = features;

        const barChart = new BarChart(
            {
                parentElement: '#chart'
            },
            outageDataForBarChart
        );

        barChart.updateVis();
        const choroplethMap = new ChoroplethMap({ parentElement: '#map' }, geoData);

    })
    .catch(e => console.error(e))