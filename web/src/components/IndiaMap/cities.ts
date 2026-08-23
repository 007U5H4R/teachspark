// Coordinate lookup + lng/lat -> SVG projection for the India map.
//
// The outline is REAL boundary data (Natural Earth 10m, India point-of-view, public domain)
// generated into indiaOutline.ts, projected through the SAME `project()` as the city markers, so
// cities always land in the right place on the map.
//
// City matching is deliberately forgiving. Teachers type their city by hand, so the live pilot
// produced "Bangalore", "BANGALORE" and "Bengaluru" for one place, plus towns no short list would
// ever contain (Raipur, Jorhat, Pathankot). An exact case-sensitive lookup against a 14-city list
// matched NONE of them and the map read "No locations yet" while the bars beside it showed 12
// sign-ups. Hence: normalise, then aliases, then a wide list, then substring — and whatever still
// fails to resolve is reported as unmapped rather than silently dropped from the totals.

import { INDIA_BBOX, INDIA_ISLANDS, INDIA_MAINLAND, type Ring } from './indiaOutline.ts';

export interface LngLat { lng: number; lat: number }

/** Projection window = the data's bounding box with a little breathing room for the glow. */
const PAD = 0.8;
export const BOUNDS = {
  lngMin: INDIA_BBOX.lngMin - PAD,
  lngMax: INDIA_BBOX.lngMax + PAD,
  latMin: INDIA_BBOX.latMin - PAD,
  latMax: INDIA_BBOX.latMax + PAD,
} as const;

// Height is fixed; width is derived from the window's TRUE aspect ratio (longitudes converge with
// latitude, so a degree of longitude is narrower than a degree of latitude at India's latitudes).
// Baking the cos(mid-latitude) correction into the frame keeps `project()` a simple linear map while
// still rendering India undistorted.
const MID_LAT_RAD = (((BOUNDS.latMin + BOUNDS.latMax) / 2) * Math.PI) / 180;
const LNG_SPAN = (BOUNDS.lngMax - BOUNDS.lngMin) * Math.cos(MID_LAT_RAD);
const LAT_SPAN = BOUNDS.latMax - BOUNDS.latMin;
export const VIEW_H = 330;
export const VIEW_W = Math.round((VIEW_H * LNG_SPAN) / LAT_SPAN);

/** Linear lng/lat -> SVG x/y. Latitude is inverted because SVG y grows downward. */
export function project({ lng, lat }: LngLat): { x: number; y: number } {
  const x = ((lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * VIEW_W;
  const y = ((BOUNDS.latMax - lat) / (BOUNDS.latMax - BOUNDS.latMin)) * VIEW_H;
  return { x, y };
}

/** [display name, lat, lng] — every state and union territory has at least one entry. */
const CITY_DATA: Array<[string, number, number]> = [
  // Metros and the largest cities
  ['Delhi', 28.61, 77.21], ['Mumbai', 19.08, 72.88], ['Bengaluru', 12.97, 77.59],
  ['Kolkata', 22.57, 88.36], ['Chennai', 13.08, 80.27], ['Hyderabad', 17.39, 78.49],
  ['Pune', 18.52, 73.86], ['Ahmedabad', 23.03, 72.57], ['Surat', 21.17, 72.83],
  // NCR and Haryana
  ['Gurugram', 28.46, 77.03], ['Noida', 28.54, 77.39], ['Ghaziabad', 28.67, 77.45],
  ['Faridabad', 28.41, 77.32], ['Panipat', 29.39, 76.97], ['Ambala', 30.38, 76.78],
  ['Karnal', 29.69, 76.99], ['Hisar', 29.15, 75.72], ['Rohtak', 28.90, 76.61],
  ['Sonipat', 28.99, 77.02], ['Yamunanagar', 30.13, 77.28],
  // Uttar Pradesh
  ['Lucknow', 26.85, 80.95], ['Kanpur', 26.45, 80.33], ['Agra', 27.18, 78.01],
  ['Varanasi', 25.32, 82.97], ['Prayagraj', 25.44, 81.85], ['Meerut', 28.98, 77.71],
  ['Aligarh', 27.90, 78.08], ['Bareilly', 28.37, 79.43], ['Moradabad', 28.84, 78.77],
  ['Gorakhpur', 26.76, 83.37], ['Saharanpur', 29.97, 77.55], ['Jhansi', 25.45, 78.57],
  ['Mathura', 27.49, 77.67], ['Firozabad', 27.15, 78.40],
  // Rajasthan
  ['Jaipur', 26.91, 75.79], ['Jodhpur', 26.24, 73.02], ['Kota', 25.21, 75.86],
  ['Bikaner', 28.02, 73.31], ['Udaipur', 24.59, 73.71], ['Ajmer', 26.45, 74.64],
  ['Alwar', 27.55, 76.63], ['Bhilwara', 25.35, 74.63], ['Sikar', 27.61, 75.14],
  ['Sri Ganganagar', 29.92, 73.88],
  // Punjab, Chandigarh, Himachal, J&K, Ladakh, Uttarakhand
  ['Chandigarh', 30.73, 76.78], ['Ludhiana', 30.90, 75.86], ['Amritsar', 31.63, 74.87],
  ['Jalandhar', 31.33, 75.58], ['Patiala', 30.34, 76.38], ['Bathinda', 30.21, 74.95],
  ['Mohali', 30.70, 76.72], ['Pathankot', 32.27, 75.65], ['Shimla', 31.10, 77.17],
  ['Dharamshala', 32.22, 76.32], ['Srinagar', 34.08, 74.80], ['Jammu', 32.73, 74.86],
  ['Leh', 34.16, 77.58], ['Dehradun', 30.32, 78.03], ['Haridwar', 29.95, 78.16],
  ['Rishikesh', 30.09, 78.27], ['Haldwani', 29.22, 79.51], ['Roorkee', 29.85, 77.89],
  // Gujarat
  ['Vadodara', 22.31, 73.18], ['Rajkot', 22.30, 70.80], ['Bhavnagar', 21.76, 72.15],
  ['Jamnagar', 22.47, 70.06], ['Gandhinagar', 23.22, 72.68], ['Anand', 22.56, 72.95],
  ['Bharuch', 21.71, 72.99], ['Junagadh', 21.52, 70.46], ['Bhuj', 23.24, 69.67],
  // Maharashtra
  ['Nagpur', 21.15, 79.09], ['Nashik', 20.00, 73.79], ['Thane', 19.22, 72.98],
  ['Navi Mumbai', 19.03, 73.03], ['Aurangabad', 19.88, 75.34], ['Solapur', 17.66, 75.91],
  ['Kolhapur', 16.70, 74.24], ['Amravati', 20.93, 77.75], ['Nanded', 19.15, 77.32],
  ['Sangli', 16.85, 74.58], ['Jalgaon', 21.01, 75.56], ['Akola', 20.70, 77.00],
  ['Ratnagiri', 16.99, 73.31],
  // Madhya Pradesh and Chhattisgarh
  ['Bhopal', 23.26, 77.41], ['Indore', 22.72, 75.86], ['Jabalpur', 23.18, 79.99],
  ['Gwalior', 26.22, 78.18], ['Ujjain', 23.18, 75.78], ['Sagar', 23.84, 78.74],
  ['Rewa', 24.53, 81.30], ['Satna', 24.58, 80.83], ['Ratlam', 23.33, 75.04],
  ['Raipur', 21.25, 81.63], ['Bhilai', 21.21, 81.38], ['Bilaspur', 22.08, 82.15],
  ['Korba', 22.35, 82.68], ['Durg', 21.19, 81.28], ['Jagdalpur', 19.08, 82.03],
  // Bihar and Jharkhand
  ['Patna', 25.59, 85.14], ['Gaya', 24.80, 85.00], ['Muzaffarpur', 26.12, 85.39],
  ['Bhagalpur', 25.24, 86.99], ['Darbhanga', 26.15, 85.90], ['Purnia', 25.78, 87.47],
  ['Ranchi', 23.34, 85.31], ['Jamshedpur', 22.80, 86.20], ['Dhanbad', 23.80, 86.43],
  ['Bokaro', 23.67, 86.15], ['Hazaribagh', 23.99, 85.36], ['Deoghar', 24.48, 86.70],
  // West Bengal, Odisha, Sikkim
  ['Siliguri', 26.73, 88.40], ['Durgapur', 23.52, 87.31], ['Asansol', 23.68, 86.98],
  ['Howrah', 22.59, 88.31], ['Darjeeling', 27.04, 88.26], ['Kharagpur', 22.35, 87.32],
  ['Bhubaneswar', 20.30, 85.82], ['Cuttack', 20.46, 85.88], ['Rourkela', 22.26, 84.85],
  ['Sambalpur', 21.47, 83.97], ['Puri', 19.81, 85.83], ['Gangtok', 27.34, 88.61],
  // North-east
  ['Guwahati', 26.15, 91.74], ['Jorhat', 26.75, 94.22], ['Dibrugarh', 27.47, 94.91],
  ['Silchar', 24.83, 92.80], ['Tezpur', 26.63, 92.80], ['Shillong', 25.58, 91.89],
  ['Imphal', 24.82, 93.94], ['Aizawl', 23.73, 92.72], ['Agartala', 23.83, 91.28],
  ['Kohima', 25.67, 94.11], ['Itanagar', 27.08, 93.61],
  // Telangana and Andhra Pradesh
  ['Warangal', 17.97, 79.59], ['Karimnagar', 18.44, 79.13], ['Nizamabad', 18.67, 78.09],
  ['Khammam', 17.25, 80.15], ['Visakhapatnam', 17.69, 83.22], ['Vijayawada', 16.51, 80.65],
  ['Guntur', 16.31, 80.44], ['Nellore', 14.44, 79.99], ['Tirupati', 13.63, 79.42],
  ['Kakinada', 16.99, 82.25], ['Rajahmundry', 17.00, 81.78], ['Kurnool', 15.83, 78.04],
  ['Anantapur', 14.68, 77.60], ['Kadapa', 14.47, 78.82],
  // Karnataka
  ['Mysuru', 12.30, 76.64], ['Hubli', 15.36, 75.12], ['Mangaluru', 12.91, 74.86],
  ['Belagavi', 15.85, 74.50], ['Kalaburagi', 17.33, 76.83], ['Davangere', 14.47, 75.92],
  ['Shivamogga', 13.93, 75.57], ['Ballari', 15.14, 76.92], ['Tumakuru', 13.34, 77.10],
  ['Udupi', 13.34, 74.75], ['Hassan', 13.01, 76.10], ['Bidar', 17.91, 77.52],
  ['Raichur', 16.21, 77.36],
  // Tamil Nadu and Puducherry
  ['Coimbatore', 11.02, 76.96], ['Madurai', 9.93, 78.12], ['Tiruchirappalli', 10.79, 78.70],
  ['Salem', 11.66, 78.15], ['Vellore', 12.92, 79.13], ['Erode', 11.34, 77.72],
  ['Thoothukudi', 8.76, 78.13], ['Tirunelveli', 8.71, 77.76], ['Thanjavur', 10.79, 79.14],
  ['Dindigul', 10.36, 77.98], ['Nagercoil', 8.18, 77.43], ['Tiruppur', 11.11, 77.34],
  ['Puducherry', 11.94, 79.83],
  // Kerala
  ['Kochi', 9.93, 76.27], ['Thiruvananthapuram', 8.52, 76.94], ['Kozhikode', 11.26, 75.78],
  ['Thrissur', 10.53, 76.21], ['Kollam', 8.89, 76.61], ['Kannur', 11.87, 75.37],
  ['Alappuzha', 9.50, 76.34], ['Palakkad', 10.78, 76.65], ['Kottayam', 9.59, 76.52],
  // Goa and the smaller UTs
  ['Panaji', 15.49, 73.83], ['Margao', 15.27, 73.96], ['Daman', 20.40, 72.83],
  ['Silvassa', 20.27, 73.02], ['Port Blair', 11.62, 92.73], ['Kavaratti', 10.57, 72.64],
];

/**
 * Strip case, accents, punctuation and spacing so hand-typed names compare reliably.
 *
 * NFD is load-bearing, not decoration: it splits "Bengalūru" into u + combining macron so the
 * a-z filter keeps the u. Without it the precomposed ū is dropped whole and the name normalises
 * to "benglru".
 */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Former / colloquial / commonly mistyped names -> the canonical entry in CITY_DATA. */
const ALIASES: Record<string, string> = {
  bangalore: 'Bengaluru', bangaluru: 'Bengaluru', banglore: 'Bengaluru', blr: 'Bengaluru',
  bombay: 'Mumbai', calcutta: 'Kolkata', madras: 'Chennai', poona: 'Pune',
  newdelhi: 'Delhi', delhincr: 'Delhi', gurgaon: 'Gurugram', noidaup: 'Noida',
  hyd: 'Hyderabad', secunderabad: 'Hyderabad', cyberabad: 'Hyderabad',
  baroda: 'Vadodara', trivandrum: 'Thiruvananthapuram', cochin: 'Kochi', ernakulam: 'Kochi',
  calicut: 'Kozhikode', trichur: 'Thrissur', quilon: 'Kollam', alleppey: 'Alappuzha',
  palghat: 'Palakkad', cannanore: 'Kannur',
  mysore: 'Mysuru', mangalore: 'Mangaluru', belgaum: 'Belagavi', gulbarga: 'Kalaburagi',
  bellary: 'Ballari', shimoga: 'Shivamogga', tumkur: 'Tumakuru', hubballi: 'Hubli',
  allahabad: 'Prayagraj', benares: 'Varanasi', banaras: 'Varanasi', cawnpore: 'Kanpur',
  vizag: 'Visakhapatnam', vishakhapatnam: 'Visakhapatnam', visakapatnam: 'Visakhapatnam',
  trichy: 'Tiruchirappalli', tiruchirapalli: 'Tiruchirappalli', tuticorin: 'Thoothukudi',
  tirupur: 'Tiruppur', pondicherry: 'Puducherry', pondy: 'Puducherry',
  simla: 'Shimla', gauhati: 'Guwahati', dispur: 'Guwahati', panjim: 'Panaji',
  jubbulpore: 'Jabalpur', navimumbai: 'Navi Mumbai', bombaysuburban: 'Mumbai',
  waltair: 'Visakhapatnam',
};

/** Canonical display name -> coordinates. */
export const CITY_COORDS: Record<string, LngLat> = Object.fromEntries(
  CITY_DATA.map(([name, lat, lng]) => [name, { lng, lat }]),
);

const BY_NORM: Record<string, string> = {};
for (const [name] of CITY_DATA) BY_NORM[norm(name)] = name;
for (const [from, to] of Object.entries(ALIASES)) BY_NORM[norm(from)] = to;

/**
 * Resolve a hand-typed city to a canonical name, or null when nothing plausibly matches.
 *
 * Tries the whole string, then the part before a comma ("Bangalore, Karnataka"), then whole WORD
 * groups, longest group first ("Sector 15 Navi Mumbai" -> Navi Mumbai, "South Bangalore" ->
 * Bengaluru).
 *
 * Matching on word groups rather than a bare substring is what keeps the map honest. A plain
 * `includes` test dragged real places onto the wrong dot with total confidence — "Suratgarh"
 * (Rajasthan) onto Surat, "Thanesar" (Haryana) onto Thane, "Patnagarh" (Odisha) onto Patna — and,
 * worst of all, spelled a city out of the connecting word: "Daman and Diu" normalises to
 * "...anand..." and landed on Anand, Gujarat. A wrong dot is worse than no dot, because the
 * caption presents it as placed.
 */
export function resolveCity(raw: string): string | null {
  const whole = norm(raw);
  if (!whole) return null;
  if (BY_NORM[whole]) return BY_NORM[whole];

  const head = norm(raw.split(',')[0] ?? '');
  if (head && BY_NORM[head]) return BY_NORM[head];

  const words = raw.split(/[^\p{L}\p{N}]+/u).map(norm).filter(Boolean);
  for (let len = words.length; len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const hit = BY_NORM[words.slice(i, i + len).join('')];
      if (hit) return hit;
    }
  }
  return null;
}

/** Lakshadweep atolls — too small to survive the data simplification, added as decorative dots. */
export const LAKSHADWEEP: LngLat[] = [
  { lng: 72.64, lat: 11.2 }, { lng: 73.05, lat: 10.57 }, { lng: 72.18, lat: 10.06 },
];

function ringToPath(ring: Ring): string {
  const [first, ...rest] = ring.map(([lng, lat]) => project({ lng, lat }));
  if (!first) return '';
  const cmds = [`M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`, ...rest.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)];
  return `${cmds.join(' ')} Z`;
}

/** SVG path for the mainland outline. */
export function indiaOutlinePath(): string {
  return ringToPath(INDIA_MAINLAND);
}

/** SVG paths for the island polygons (Andaman & Nicobar). */
export function indiaIslandPaths(): string[] {
  return INDIA_ISLANDS.map(ringToPath);
}
