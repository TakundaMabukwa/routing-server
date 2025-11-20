const distance = require('@turf/distance').default;
const { point } = require('@turf/helpers');

// Toll gate polygon coordinates
const polygonCoords = [
  [28.24978, -25.644089],
  [28.249662, -25.642572],
  [28.251733, -25.642486],
  [28.258358, -25.642437],
  [28.258462, -25.64382],
  [28.24978, -25.644089] // Close the polygon
];

// Vehicle location
const vehicleLat = -26.434615;
const vehicleLon = 27.508290;

console.log('🗺️  Toll Gate Polygon Analysis\n');

console.log('Polygon Points:');
polygonCoords.forEach((coord, i) => {
  if (i < polygonCoords.length - 1) {
    console.log(`  ${i + 1}. Lon: ${coord[0]}, Lat: ${coord[1]}`);
  }
});
console.log();

// Calculate centroid
const sumLat = polygonCoords.slice(0, -1).reduce((sum, c) => sum + c[1], 0);
const sumLon = polygonCoords.slice(0, -1).reduce((sum, c) => sum + c[0], 0);
const count = polygonCoords.length - 1;
const centroid = {
  lat: sumLat / count,
  lon: sumLon / count
};

console.log('Polygon Centroid:');
console.log(`  Lat: ${centroid.lat.toFixed(6)}, Lon: ${centroid.lon.toFixed(6)}\n`);

console.log('Vehicle Location:');
console.log(`  Lat: ${vehicleLat}, Lon: ${vehicleLon}\n`);

// Create vehicle point
const vehiclePoint = point([vehicleLon, vehicleLat]);

// Calculate distance from centroid
const centroidPoint = point([centroid.lon, centroid.lat]);
const distFromCentroid = distance(centroidPoint, vehiclePoint, { units: 'kilometers' });

console.log('Distance from Centroid:');
console.log(`  ${distFromCentroid.toFixed(2)} km (${(distFromCentroid * 1000).toFixed(0)} meters)\n`);

// Calculate distance from each polygon point
console.log('Distance from each polygon corner:');
let minDist = Infinity;
let closestPoint = 0;

polygonCoords.slice(0, -1).forEach((coord, i) => {
  const cornerPoint = point([coord[0], coord[1]]);
  const dist = distance(cornerPoint, vehiclePoint, { units: 'kilometers' });
  console.log(`  Point ${i + 1}: ${dist.toFixed(2)} km`);
  if (dist < minDist) {
    minDist = dist;
    closestPoint = i + 1;
  }
});

console.log(`\n✅ Closest corner: Point ${closestPoint} at ${minDist.toFixed(2)} km\n`);

// Check detection thresholds
console.log('Detection Status:');
if (distFromCentroid <= 0.1) {
  console.log('  🚨 WITHIN 100m - Would trigger toll gate alert!');
} else if (distFromCentroid <= 1) {
  console.log('  ⚠️  WITHIN 1km - Close but outside toll gate radius');
} else {
  console.log(`  ✅ OUTSIDE - ${distFromCentroid.toFixed(2)} km away, no alert`);
}
