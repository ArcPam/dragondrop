require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/layers/CSVLayer",
  "esri/widgets/FeatureTable",
], function (Map, MapView, FeatureLayer, CSVLayer, FeatureTable) {

  const map = new Map({
    basemap: "streets-navigation-vector"
  });

  const view = new MapView({
    container: "viewDiv",
    map: map,
    center: [-100.33, 43.69],
    zoom: 4
  });

  const featureServiceUrl = "https://services7.arcgis.com/a8Z6qdGJjXiD9E54/arcgis/rest/services/Change_Request_DU_RFP_TEST/FeatureServer/0";

  const selectedLayer = new FeatureLayer({
    url: featureServiceUrl,
    outFields: ["*"],
    title: "Change Request Layer"
  });

  map.add(selectedLayer);

  const featureTable = new FeatureTable({
    view: view,
    layer: selectedLayer,
    container: document.getElementById("tableDiv"),
    editingEnabled: true,
    multiSortEnabled: true
  });

  selectedLayer.when(() => {
    selectedLayer.queryExtent().then((response) => {
      view.goTo(response.extent);
    });
  });

  const dropZone = document.getElementById("dropZone");

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.style.backgroundColor = "rgba(0, 0, 0, 0.1)";
  });

  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.style.backgroundColor = "rgba(0, 0, 0, 0.1)";
    const file = event.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) {
      const reader = new FileReader();
      reader.onload = function (event) {
        const csvData = event.target.result;
        const csvBlob = new Blob([csvData], { type: "text/csv" });
        const url = URL.createObjectURL(csvBlob);

        // Create CSV Layer
        const csvLayer = new CSVLayer({
          url: url,
          popupTemplate: {
            title: "{objectid}",
            content: [
              {
                type: "fields",
                fieldInfos: [
                  { fieldName: "objectid", label: "Object ID" },
                  { fieldName: "room_name", label: "Room Name" },
                  { fieldName: "use_type_new", label: "Use Type" },
                  { fieldName: "status", label: "Status" }
                  // Add other fields as necessary
                ]
              }
            ]
          }
        });

        map.add(csvLayer);

        // Apply updates to the selected feature layer
        applyBulkEdits(csvLayer);
      };
      reader.readAsText(file);
    }
  });

  function applyBulkEdits(csvLayer) {
    const query = selectedLayer.createQuery();
    query.where = "1=1"; // Fetch all features
    query.returnGeometry = false;
    query.outFields = ["*"]; // Fetch all fields

    selectedLayer.queryFeatures(query).then((result) => {
      const existingFeatures = result.features;
      const featuresToUpdate = [];

      csvLayer.queryFeatures().then((csvResult) => {
        const csvFeatures = csvResult.features;

        csvFeatures.forEach(csvFeature => {
          const csvAttributes = csvFeature.attributes;
          const csvObjectId = csvAttributes.objectid;

          // Find matching feature in the selected feature layer
          const matchingFeature = existingFeatures.find(feature => feature.attributes.objectid == csvObjectId);

          if (matchingFeature) {
            console.log(`Updating feature with OBJECTID: ${csvObjectId}`);
            
            const updateAttributes = {};
            updateAttributes["objectid"] = csvObjectId;

            // Compare and update the fields (excluding non-editable ones)
            ["room_name", "use_type_new", "status"].forEach(field => {
              if (csvAttributes[field] !== matchingFeature.attributes[field]) {
                updateAttributes[field] = csvAttributes[field];
              }
            });

            if (Object.keys(updateAttributes).length > 1) {
              featuresToUpdate.push({
                attributes: updateAttributes // Include OBJECTID for updates
              });
            }
            function refreshTable() {
              featureTable.refresh(); // Refresh the feature table to reflect the updates
            }
            refreshTable();            
          }
        });

        // Apply the updates to the feature layer
        if (featuresToUpdate.length > 0) {
          selectedLayer.applyEdits({
            updateFeatures: featuresToUpdate
          }).then((result) => {
            console.log("Bulk update successful: ", result);

            result.updateFeatureResults.forEach(res => {
              if (res.error) {
                console.error("Error updating feature: ", res.error);
              }
            });

          }).catch((error) => {
            console.error("Error applying edits: ", error);
          });
        } else {
          console.log("No updates to apply.");
        }
      }).catch((error) => {
        console.error("Error querying CSV Layer: ", error);
      });
    }).catch((error) => {
      console.error("Error querying features: ", error);
    });
  }


  function convertToCSV(features) {
    if (features.length === 0) return "";
  
    // Define date fields (adjust based on your data structure)
    const dateFields = ["CreationDate", "EditDate", "date_submitted"]; // Modify this based on your date fields
  
    // Add any fields like lat/long from the geometry or the attribute fields
    const keys = Object.keys(features[0].attributes); // Get all attribute fields
  
    // Create CSV headers (add latitude and longitude as new columns)
    const csvHeader = [...keys, "latitude", "longitude"].join(",");
  
    // Create CSV rows including latitude/longitude and properly formatted date fields
    const csvRows = features.map(feature => {
      const row = keys.map(key => {
        let value = feature.attributes[key];
  
        // Format date fields if necessary
        if (dateFields.includes(key) && typeof value === "number") {
          value = new Date(value).toLocaleDateString(); // Convert from timestamp to human-readable format
        }
  
        return value !== undefined ? value : ""; // Handle missing values
      });
  
      // Add latitude and longitude to the row
      const lat = feature.geometry ? feature.geometry.y : ""; // Handle missing geometry
      const lon = feature.geometry ? feature.geometry.x : "";
  
      return [...row, lat, lon].join(","); // Return row as comma-separated values
    });
  
    // Combine the header and rows into a single CSV string
    return [csvHeader, ...csvRows].join("\n");
  }
  
  // Helper function to trigger CSV download
  function downloadCSV(content, fileName) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  // Usage Example (Bind this to a download button event):
  const downloadBtn = document.getElementById("downloadBtn");
  
  downloadBtn.addEventListener("click", () => {
    selectedLayer.queryFeatures({
      where: "1=1",
      returnGeometry: true, // Ensure geometries (lat/lon) are returned
      outFields: ["*"] // Query all fields
    }).then((results) => {
      const csvContent = convertToCSV(results.features); // Convert features to CSV
      downloadCSV(csvContent, "feature_table_data.csv"); // Trigger the download
    }).catch((error) => {
      console.error("Error downloading CSV:", error);
    });
  });
  


});