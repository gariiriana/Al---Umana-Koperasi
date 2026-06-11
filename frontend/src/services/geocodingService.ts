/**
 * Reverse Geocoding Service using OpenStreetMap Nominatim.
 * Resolves GPS coordinates to a human-readable address.
 */

const addressCache = new Map<string, string>();

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string> {
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (addressCache.has(cacheKey)) {
    return addressCache.get(cacheKey)!;
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        headers: {
          "Accept-Language": "id,en",
          // Nominatim requires a user agent or referrer
          "User-Agent": "AlUmanaKoperasi/1.0",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Nominatim error: ${response.status}`);
    }

    const data = await response.json();
    if (data && data.address) {
      const addr = data.address;
      // Build a clean short address like: "Pasirtanjung, Cikarang Pusat, Jawa Barat"
      const parts: string[] = [];
      
      const main = addr.road || addr.suburb || addr.neighbourhood || addr.village || addr.hamlet;
      const district = addr.city_district || addr.subdistrict || addr.municipality || addr.town;
      const city = addr.city || addr.county || addr.regency;
      const state = addr.state;
      const postcode = addr.postcode;

      if (main) parts.push(main);
      if (district) parts.push(district);
      if (city) parts.push(city);
      if (state) parts.push(state);
      if (postcode) parts.push(postcode);

      const resolved = parts.join(", ");
      addressCache.set(cacheKey, resolved);
      return resolved;
    }
    
    if (data && data.display_name) {
      addressCache.set(cacheKey, data.display_name);
      return data.display_name;
    }
  } catch (err) {
    console.error("[Geocoding] Failed to reverse geocode:", err);
  }

  return "Lokasi tidak teridentifikasi";
}
