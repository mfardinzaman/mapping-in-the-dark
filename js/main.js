Promise.all([
  d3.json("../data/geometry_data.geojson"),
  d3.csv("../data/aggreted_power_outages_complete_no_pr.csv"),
  d3.csv("data/cartogram_avg_outage.csv"),
  d3.csv("../data/pops_2019_2023_county.csv"),
])
  .then((data) => {
    const geoData = data[0];
    const outageData = data[1];
    const cartogramData = data[2];
    const popData = data[3];

    outageData.forEach((d) => {
      d.year = +d.year;
      d.month = +d.month;
      d.outage_count = +d.outage_count;
    });

    const popLookup = new Map(
      popData.map((d) => {
        return [
          +d.fips_code,
          {
            pop_2019: +d.pop_2019,
            pop_2020: +d.pop_2020,
            pop_2021: +d.pop_2021,
            pop_2022: +d.pop_2022,
            pop_2023: +d.pop_2023,
          },
        ];
      })
    );

    // Filter Puerto Rico
    const features = geoData.features.filter(
      (d) => d.properties.state !== "Puerto Rico"
    );

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

    features.forEach((d) => {
      d.properties.fips_code = +d.properties.fips_code;
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

    const barChart = new BarChart(
      {
        parentElement: "#chart",
      },
      outageData
    );

    barChart.updateVis();
    const choroplethMap = new ChoroplethMap({ parentElement: "#map" }, geoData);

    // TODO: Incorporate M3 Changes
    cartogramData.forEach((d) => {
      d.x = +d.x;
      d.y = +d.y - 1;
      // M3 TODO: change total to populaiton density metric
      d.total = +d.total;
      d.affected = +d["average_customers_out"];
      d.proportionAffected = (d.affected / d.total) * 100;
      // M3 TODO: aggregate non-white data together?
      d.white = +d["White alone"] || 0;
      d.asian = +d["Asian alone"] || 0;
      d.black = +d["Black or African American alone"] || 0;
      d.indian = +d["American Indian and Alaska Native alone"] || 0;
      d.hawaiin = +d["Native Hawaiian and Other Pacific Islander alone"] || 0;
      d.mixed = +d["Population of two or more races:"] || 0;
      d.other = +d["Some Other Race alone"] || 0;

      d.totalNonWhite = d.total - d.white;
      // console.log(d.totalNonWhite, typeof d.totalNonWhite);

      d.proportionNonWhite = +d.totalNonWhite / d.total;
      d.proportionWhite = 1 - d.percentNonWhite;

      // might be a bit redundant
      d.pieData = [
        { value: d.black, race: "black" },
        { value: d.indian, race: "indian" },
        { value: d.asian, race: "asian" },
        { value: d.hawaiin, race: "hawaiin" },
        { value: d.mixed, race: "mixed" },
        { value: d.other, race: "other" },
      ];
    });

    // TODO: change colour scheme
    const raceColours = {
      black: "#006d2c", // #006d2c alt1: #2A1E6C alt2: #9a2445
      asian: "#2ca25f", // #2ca25f alt1: #3D7DFF alt2: #00C2C2
      mixed: "#66c2a4", // #66c2a4 alt1: #154e56 alt2: #E65AA0 alt3: #D9A5D9
      indian: "#99d8c9", // #99d8c9 alt1: #d30c45; alt2:  #E85C41"
      hawaiin: "#ccece6", // #ccece6 alt1: #069668; alt2: #65DDAE
      other: "#edf8fb", // #edf8fb alt1: #dc8873 alt2:  #E8C677 alt3: #C2C8D1
    };

    // Initialize the cartogram
    const cartogram = new Cartogram(
      {
        parentElement: "#cartogram",
        // Optional: other configurations
      },
      cartogramData,
      raceColours
    );
  })
  .catch((e) => console.error(e));
