import { defineEventHandler, getQuery } from "h3";

import { getHowMuchStore } from "../../../../../../domains/how-much/server/store.ts";

export default defineEventHandler(async (event) => {
  const { query } = getQuery(event) as { query?: string };
  const store = await getHowMuchStore();
  const suggestions = await store.getSuggestions(
    typeof query === "string" ? query : "",
  );

  return { suggestions };
});
