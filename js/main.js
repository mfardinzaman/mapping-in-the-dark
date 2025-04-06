let geoData, outageData, barChart, choroplethMap;
const dispatcher = d3.dispatch('selectCounty', 'regionChanged');

Promise.all([
    d3.json("../data/geometry_data.geojson"),
    d3.csv("../data/aggreted_power_outages_complete_no_pr.csv"),
    d3.csv("data/cartogram_avg_outage.csv"),
    d3.csv("../data/pops_2019_2023_county.csv"),
])
  .then((data) => {
    geoData = data[0];
    outageData = data[1];
    const cartogramData = data[2];
    const popData = data[3];

    // ==========================================
    // Bar chart
    // ==========================================
    outageData.forEach((d) => {
      d.fips_code = +d.fips_code;
      d.year = +d.year;
      d.month = +d.month;
      d.outage_count = +d.outage_count;
    });
    
    // Collect outage data by fips_code
    let outageMap = {};
    outageData.forEach((d) => {
      if (d.fips_code in outageMap === false) {
        outageMap[d.fips_code] = [];
      }

      outageMap[d.fips_code].push({
        date: `${d.year}-${String(d.month).padStart(2, "0")}`,
        outage_count: +d.outage_count,
        total_customers_out: +d.total_customers_out,
      });
    });

    const mapContainerWidth = document.querySelector("#map").getBoundingClientRect().width;
    barChart = new BarChart({ parentElement: "#chart", containerWidth: mapContainerWidth }, outageData, dispatcher);
    barChart.updateVis();

    // ==========================================
    // Choropleth Map
    // ==========================================
    const popLookup = new Map(popData.map(d => {
      return [+d.fips_code, {
        pop_2019: +d.pop_2019,
        pop_2020: +d.pop_2020,
        pop_2021: +d.pop_2021,
        pop_2022: +d.pop_2022,
        pop_2023: +d.pop_2023,
        state_abbr: d.state_abbr
      }]
    }));

    // Filter Puerto Rico
    const features = geoData.features.filter(
      (d) => d.properties.state !== "Puerto Rico"
    );

    features.forEach((d) => {
      d.properties.fips_code = +d.properties.fips_code;
      d.properties.selected = false;

      const outage_data = outageMap[d.properties.fips_code];
      d.properties.outage_data = outage_data;
      
      d.properties.sum_outage_count = outage_data.reduce((acc, d) => {
        return d ? acc + d.outage_count : acc;
      }, 0);
      d.properties.sum_total_customers_out = outage_data.reduce((acc, d) => {
        return d ? acc + d.total_customers_out : acc;
      }, 0);

      const pops = popLookup.get(d.properties.fips_code);
      Object.assign(d.properties, pops);
    });

    geoData.features = features;

    choroplethMap = new ChoroplethMap({ parentElement: "#map" }, geoData, dispatcher);

    // Listen for region selector event
    d3.selectAll('.segmented-controls input')
      .on('change', function(event) {
        const region = d3.select(this).attr('id');
        dispatcher.call('regionChanged', event, region);
      });

    d3.select('#reset-button')
      .on('click', function(event) {
        choroplethMap.data.features.forEach(d => {
          d.properties.selected = false;
        });
        choroplethMap.selectedFips = new Set();
        
        dispatcher.call('selectCounty', event, choroplethMap.selectedFips);
      })

    // ==========================================
    // Cartogram
    // ==========================================
    // prepare cartogram + piechart data:
    cartogramData.forEach((d) => {
      d.x = +d.x;
      d.y = +d.y - 1;

            d.total = +d.total;
            d.affected = +d["average_customers_out"];
            d.proportionAffected = (d.affected / d.total) * 100;

            d.white = +d["White alone"] || 0;
            d.asian = +d["Asian alone"] || 0;
            d.black = +d["Black or African American alone"] || 0;
            d.indian = +d["American Indian and Alaska Native alone"] || 0;
            d.hawaiin = +d["Native Hawaiian and Other Pacific Islander alone"] || 0;
            d.mixed = +d["Population of two or more races:"] || 0;
            d.other = +d["Some Other Race alone"] || 0;

            d.totalNonWhite = d.total - d.white;
            d.proportionNonWhite = +d.totalNonWhite / d.total;
            d.proportionWhite = 1 - d.percentNonWhite;

            // keep pieData in this order: other, indian, hawaiin, asinan, mixed, black
            d.pieData = [
                { value: d.other, race: "other" },
                { value: d.indian, race: "indian" },
                { value: d.hawaiin, race: "hawaiin" },
                { value: d.asian, race: "asian" },
                { value: d.mixed, race: "mixed" },
                { value: d.black, race: "black" },
            ];
        });

        const raceCategories = Array.from(
            new Set(cartogramData.flatMap((d) => d.pieData.map((p) => p.race)))
        );

        // Initialize the cartogram
        const cartogram = new Cartogram(
            {
                parentElement: "#cartogram",
                // Optional: other configurations
            },
            cartogramData,
            raceCategories
        );
    })
    .catch((e) => console.error(e));

dispatcher.on('selectCounty', selectedFips => {
  choroplethMap.updateVis();

  barChart.selectedFips = selectedFips;
  barChart.updateVis();
})

dispatcher.on('regionChanged', region => {
  choroplethMap.selectByCounty = region === 'county';
})