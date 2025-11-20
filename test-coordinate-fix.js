const distance = require('@turf/distance').default;
const { point } = require('@turf/helpers');

// Doornpoort Toll Gate coordinates (lon,lat,elevation format)
const coordString = '28.24978,-25.644089,0 28.249662,-25.642572,0 28.251733,-25.642486,0 28.258358,-25.642437,0 28.258462,-25.64382,0';

// Parse coordinates correctly
const coords = coordString.split(' ').map(coord => {
  const parts = coord.split(',').map(parseFloat);
  return { lat: parts[1], lon: parts[0] }; // lon is first, lat is second
});

// Calculate centroid
const sumLat = coords.reduce((sum, c) => sum + c.lat, 0);
const sumLon = coords.reduce((sum, c) => sum + c.lon, 0);
const centroid = {
  lat: sumLat / coords.length,
  lon: sumLon / coords.length
};

// Vehicle location
const vehicleLat = -26.434615;
const vehicleLon = 27.508290;

console.log('🔧 Coordinate Parsing Fix Test\n');
console.log('Doornpoort Toll Gate Centroid:');
console.log(`  Lat: ${centroid.lat.toFixed(6)}, Lon: ${centroid.lon.toFixed(6)}\n`);

console.log('Vehicle Location:');
console.log(`  Lat: ${vehicleLat}, Lon: ${vehicleLon}\n`);

// Calculate distance
const from = point([centroid.lon, centroid.lat]);
const to = point([vehicleLon, vehicleLat]);
const dist = distance(from, to, { units: 'meters' });

console.log('Distance:');
console.log(`  ${(dist / 1000).toFixed(2)} km (${dist.toFixed(0)} meters)\n`);

if (dist <= 100) {
  console.log('✅ WITHIN 100m - Would trigger toll gate alert');
} else if (dist <= 1000) {
  console.log('⚠️  Within 1km but outside 100m radius');
} else {
  console.log('❌ OUTSIDE detection range');
}
