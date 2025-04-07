let geoData,
  outageData,
  timeline,
  choroplethMap,
  selectedStartDate,
  selectedEndDate;

let isMapView = true;
const dispatcher = d3.dispatch(
  "selectCounty",
  "resetCounty",
  "regionChanged",
  "timeRangeChanged"
);

Promise.all([
  d3.json("../data/geometry_data.geojson"),
  d3.csv("../data/aggreted_power_outages_complete_no_pr.csv"),
  d3.csv("../data/cartogram_average_monthly_outages.csv"),
  d3.csv("../data/cartogram_grid_and_demographic_data.csv"),
  d3.csv("../data/pops_2019_2023_county.csv"),
])
  .then((data) => {
    geoData = data[0];
    outageData = data[1];
    const cartogramData = data[2];
    const cartogramDemographicData = data[3];
    const popData = data[4];

    // ==========================================
    // Time line
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

    timeline = new TimeLine(
      { parentElement: "#chart" },
      outageData,
      dispatcher
    );
    timeline.updateVis();

    // ==========================================
    // Choropleth Map
    // ==========================================
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
            state_abbr: d.state_abbr,
          },
        ];
      })
    );

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

    choroplethMap = new ChoroplethMap(
      { parentElement: "#map" },
      geoData,
      dispatcher
    );

    // Listen for region selector event
    d3.selectAll("#region-selector input").on("change", function (event) {
      const region = d3.select(this).attr("id");
      dispatcher.call("regionChanged", event, region);
    });

    d3.select("#reset-button").on("click", function (event) {
      dispatcher.call("resetCounty", event);
    });

    // ==========================================
    // Cartogram
    // ==========================================
    // prepare cartogram + piechart data:
    cartogramDemographicData.forEach((d) => {
      d.x = +d.x;
      d.y = +d.y - 1;
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
        { value: d.other, race: "Other" },
        { value: d.indian, race: "American Indian/Alaska Native" },
        { value: d.hawaiin, race: "Native Hawaiin/Other Pacific Islander" },
        { value: d.asian, race: "Asian" },
        { value: d.mixed, race: "Mixed Race" },
        { value: d.black, race: "Black/African American" },
      ];
    });

    cartogramData.forEach((d) => {
      d.total = +d.total;
      d.affected = +d["avg_customers_out"];
      d.proportionAffected = (d.affected / d.total) * 100;
      d.date = new Date(`2020-${String(+d["month"]).padStart(2, "0")}`);
    });

    const raceCategories = Array.from(
      new Set(
        cartogramDemographicData.flatMap((d) => d.pieData.map((p) => p.race))
      )
    );

    // Initialize the cartogram
    const cartogram = new Cartogram(
      {
        parentElement: "#cartogram",
        // Optional: other configurations
      },
      cartogramData,
      cartogramDemographicData,
      raceCategories,
      dispatcher
    );

    // create listener for view selector
    d3.selectAll("#map-view-selector input").on("change", function (event) {
      const selected = d3.select(this).attr("id");
      isMapView = selected == "select-choropleth";

      d3.select("#map").classed("hidden", !isMapView);
      d3.select("#cartogram").classed("hidden", isMapView);

      timeline.brush.move(timeline.brushGroup, null);

      if (!isMapView) d3.select("#reset-button").node().click();
      timeline.updateVis();
    });
  })
  .catch((e) => console.error(e));

dispatcher.on("selectCounty", (selectedFips) => {
  choroplethMap.updateVis();

  timeline.selectedFips = selectedFips;
  timeline.updateVis();
});

dispatcher.on("resetCounty", () => {
  choroplethMap.data.features.forEach((d) => {
    d.properties.selected = false;
  });

  choroplethMap.selectedFips = new Set();
  choroplethMap.updateVis();

  timeline.selectedFips = new Set();
  timeline.updateVis();
});

dispatcher.on("regionChanged", (region) => {
  choroplethMap.selectByCounty = region === "county";
});

dispatcher.on("timeRangeChanged.main", ({ startDate, endDate }) => {
  selectedStartDate = startDate;
  selectedEndDate = endDate;
  updateTitle(startDate, endDate);
});

function updateTitle(startDate, endDate) {
  const title = d3.select("#map-title");
  const formatter = d3.timeFormat("%b %Y");

  let dateText;
  if (isMapView) {
    dateText =
      !startDate || !endDate
        ? "(2019 – 2023)"
        : `(${formatter(startDate)} – ${formatter(endDate)})`;
  } else {
    if (!startDate || !endDate) {
      dateText = "(2020)";
    } else {
      const startYear = startDate.getFullYear();
      const endYear = endDate.getFullYear();

      if (startYear === 2020 && endYear === 2020) {
        dateText = `(${formatter(startDate)} – ${formatter(endDate)})`;
      } else if (startYear === 2020) {
        dateText = `${formatter(startDate)} - Dec 2020`;
      } else if (endYear === 2020) {
        dateText = `Jan 2020 - ${formatter(endDate)}`;
      } else {
        // If both of the dates are outside of 2020, display "2020"
        dateText = "(2020)";
      }
    }
  }

  const titleText = isMapView
    ? `Map of Power Outages per Person ${dateText}`
    : `Average Proportion of People Affected by Outages ${dateText}`;

  title.text(titleText);
}
