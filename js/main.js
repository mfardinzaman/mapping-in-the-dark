Promise.all([
    d3.json('../data/geometry_data.geojson'),
    d3.csv('../data/aggreted_power_outages_complete_no_pr.csv'),
    d3.csv('data/cartogram_grid.csv')
])
    .then((data) => {
        const geoData = data[0];
        const outageData = data[1];
        const cartogramData = data[2];
        outageData.forEach(d => {
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
                date: `${d.year}-${String(d.month).padStart(2, "0")}`,
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
            outageData
        );

        barChart.updateVis();
        const choroplethMap = new ChoroplethMap({ parentElement: '#map' }, geoData);

        // TODO: Incorporate M3 Changes
        cartogramData.forEach(d => {
            d.x = +d.x;
            d.y = +d.y - 1;
            // M3 TODO: change total to populaiton density metric
            d.total = +d.total;
            // M3 TODO: aggregate non-white data together?
            d.white = +d["White alone"];
            d.asian = +d["Asian alone"];
            d.black = +d["Black or African American alone"];
            d.indian = +d["American Indian and Alaska Native alone"];
            d.hawaiin = +d["Native Hawaiian and Other Pacific Islander alone"];
            d.mixed = +d["Population of two or more races:"];
            // might be a bit redundant
            d.pieData = [
                { value: d.white, race: "white" },
                { value: d.black, race: "black" },
                { value: d.indian, race: "indian" },
                { value: d.asian, race: "asian" },
                { value: d.hawaiin, race: "hawaiin" },
                { value: d.mixed, race: "mixed" }
            ]
        });

        // // M3 TODO: aggregate non-white data together?
        // // also change the colour scheme
        const raceColours = {
            "white": "blue",
            "asian": "green",
            "black": "black",
            "indian": "red",
            "hawaiin": "yellow",
            "mixed": "#FFA500"
        };

        // Initialize the cartogram
        const cartogram = new Cartogram({
            parentElement: '#cartogram',
            // Optional: other configurations
        }, cartogramData, raceColours);
    })
    .catch(e => console.error(e))