import type {
  CityAverage,
  CityColorMapping,
  CityPrices,
  ProductEntry,
} from "./types.ts";

export const REPORT_THRESHOLD = 5;

export const computeCityPrices = (
  products: ProductEntry[],
): CityPrices[] => {
  const byCity = new Map<string, CityPrices["prices"]>();

  for (const product of products) {
    const city = extractCityKey(product.location);
    if (!byCity.has(city)) {
      byCity.set(city, []);
    }
    byCity.get(city)!.push({
      price: product.price,
      note: product.note || "",
      date: product.timestamp,
      reportCount: product.reportCount || 0,
    });
  }

  return Array.from(byCity.entries()).map(([city, prices]) => ({
    city,
    prices,
  }));
};

export const computeCityAverages = (
  cityPrices: CityPrices[],
): CityAverage[] => {
  return cityPrices.map(({ city, prices }) => {
    const validPrices = prices.filter(
      (p) => (p.reportCount || 0) < REPORT_THRESHOLD,
    );
    const sum = validPrices.reduce((acc, cur) => acc + cur.price, 0);
    const avgPrice = validPrices.length > 0 ? sum / validPrices.length : 0;

    return {
      city,
      avgPrice,
      prices,
      validCount: validPrices.length,
      totalCount: prices.length,
    };
  }).sort((a, b) => b.avgPrice - a.avgPrice);
};

export const computeColorMapping = (
  cityAverages: CityAverage[],
): CityColorMapping[] => {
  if (cityAverages.length === 0) return [];

  const prices = cityAverages
    .map((c) => c.avgPrice)
    .filter((p) => !Number.isNaN(p) && p > 0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  return cityAverages.map(({ city, avgPrice, prices }) => {
    const normalizedPrice = (avgPrice - minPrice) / priceRange;
    const hue = Math.max(0, Math.min(120, 120 * (1 - normalizedPrice)));
    const saturation = 75;
    const lightness = 40 + 20 * normalizedPrice;

    return {
      city,
      avgPrice,
      prices: prices.map((p) => ({
        price: p.price,
        date: p.date,
        reportCount: p.reportCount || 0,
        note: p.note || "",
      })),
      color: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      normalizedValue: normalizedPrice,
    };
  });
};

export const extractCityKey = (location: string): string => {
  return location.split(/[省市区县]/, 1)[0];
};
