const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/reverse?format=json&accept-language=zh-CN";

export const reverseGeocode = async (
  lat: number,
  lng: number,
): Promise<string[]> => {
  try {
    const response = await fetch(
      `${NOMINATIM_URL}&lat=${lat}&lon=${lng}`,
      { headers: { "User-Agent": "how-much-this/1.0" } },
    );

    if (!response.ok) return ["未知地区"];

    const data = await response.json() as {
      address?: Record<string, string>;
    };
    const possibleNames: string[] = [];

    if (data.address?.city) possibleNames.push(data.address.city);
    if (data.address?.town) possibleNames.push(data.address.town);
    if (data.address?.village) possibleNames.push(data.address.village);
    if (data.address?.state) possibleNames.push(data.address.state);
    if (data.address?.region) possibleNames.push(data.address.region);
    if (data.address?.county) possibleNames.push(data.address.county);

    return possibleNames;
  } catch {
    return ["未知地区"];
  }
};
