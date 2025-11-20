const distance = require('@turf/distance').default;
const { point } = require('@turf/helpers');

// Polygon coordinates
const polygonCoords = [
  { lon: 28.24978, lat: -25.644089 },
  { lon: 28.249662, lat: -25.642572 },
  { lon: 28.251733, lat: -25.642486 },
  { lon: 28.258358, lat: -25.642437 },
  { lon: 28.258462, lat: -25.64382 }
];

// Target point
const targetLat = -26.43461500;
const targetLon = 27.50829000;

console.log('🗺️  Distance Calculation\n');

// Calculate centroid of polygon
const sumLat = polygonCoords.reduce((sum, c) => sum + c.lat, 0);
const sumLon = polygonCoords.reduce((sum, c) => sum + c.lon, 0);
const centroid = {
  lat: sumLat / polygonCoords.length,
  lon: sumLon / polygonCoords.length
};

console.log('Polygon Centroid:');
console.log(`  Lat: ${centroid.lat}`);
console.log(`  Lon: ${centroid.lon}\n`);

console.log('Target Point:');
console.log(`  Lat: ${targetLat}`);
console.log(`  Lon: ${targetLon}\n`);

// Calculate distance from centroid to target
const from = point([centroid.lon, centroid.lat]);
const to = point([targetLon, targetLat]);
const dist = distance(from, to, { units: 'kilometers' });

console.log('Distance from Centroid to Target:');
console.log(`  ${dist.toFixed(2)} km`);
console.log(`  ${(dist * 1000).toFixed(0)} meters\n`);

// Calculate distance from each polygon point to target
console.log('Distance from each polygon point to target:\n');
polygonCoords.forEach((coord, i) => {
  const pointFrom = point([coord.lon, coord.lat]);
  const pointDist = distance(pointFrom, to, { units: 'kilometers' });
  console.log(`  Point ${i + 1}: ${pointDist.toFixed(2)} km`);
});

// Find closest point
const distances = polygonCoords.map(coord => {
  const pointFrom = point([coord.lon, coord.lat]);
  return distance(pointFrom, to, { units: 'kilometers' });
});
const minDist = Math.min(...distances);
const closestIndex = distances.indexOf(minDist);

console.log(`\n✅ Closest point: Point ${closestIndex + 1} at ${minDist.toFixed(2)} km\n`);

// Check if within 1km
if (dist <= 1) {
  console.log('🚨 Target is WITHIN 1km of polygon centroid');
} else {
  console.log('✅ Target is OUTSIDE 1km radius');
}
