import { defineEventHandler, getQuery } from "h3";

import { getHowMuchStore } from "../../../../../../domains/how-much/server/store.ts";
import {
  computeCityAverages,
  computeCityPrices,
  computeColorMapping,
} from "../../../../../../domains/how-much/core/statistics.ts";

export default defineEventHandler(async (event) => {
  const { query } = getQuery(event) as { query?: string };
  if (!query || typeof query !== "string" || query.trim() === "") {
    return { products: [] };
  }

  const store = await getHowMuchStore();
  const products = await store.getRecords(query.trim());

  const cityPrices = computeCityPrices(products);
  const cityAverages = computeCityAverages(cityPrices);
  const priceData = computeColorMapping(cityAverages);

  return { products, priceData };
});
