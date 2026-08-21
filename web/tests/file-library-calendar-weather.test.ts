import { expect } from "@std/expect";

import {
  buildFileLibraryCalendarMonth,
  buildOpenMeteoHudWeatherUrl,
  classifyFileLibraryWeatherCode,
  parseOpenMeteoHudWeather,
} from "../src/file-library/hud-weather.ts";

Deno.test("HUD calendar renders a complete Monday-first month in six square rows", () => {
  const month = buildFileLibraryCalendarMonth(new Date(2026, 7, 21), 0);

  expect(month.year).toBe(2026);
  expect(month.monthIndex).toBe(7);
  expect(month.label).toBe("2026 年 8 月");
  expect(month.days).toHaveLength(42);
  expect(month.days.slice(0, 5)).toEqual([null, null, null, null, null]);
  expect(month.days[5]).toMatchObject({
    day: 1,
    dateKey: "2026-08-01",
    isToday: false,
  });
  expect(month.days[25]).toMatchObject({
    day: 21,
    dateKey: "2026-08-21",
    isToday: true,
  });
  expect(month.days[35]).toMatchObject({
    day: 31,
    dateKey: "2026-08-31",
    isToday: false,
  });
});

Deno.test("HUD calendar shifts across year boundaries and preserves the real today marker", () => {
  const previous = buildFileLibraryCalendarMonth(new Date(2026, 0, 15), -1);
  const next = buildFileLibraryCalendarMonth(new Date(2026, 11, 15), 1);

  expect(previous.label).toBe("2025 年 12 月");
  expect(previous.days.filter(Boolean)).toHaveLength(31);
  expect(previous.days.some((day) => day?.isToday)).toBe(false);
  expect(next.label).toBe("2027 年 1 月");
  expect(next.days.filter(Boolean)).toHaveLength(31);
  expect(next.days.some((day) => day?.isToday)).toBe(false);
});

Deno.test("HUD weather maps WMO conditions to a stable visual vocabulary", () => {
  expect(classifyFileLibraryWeatherCode(0)).toEqual({
    kind: "clear",
    label: "晴",
  });
  expect(classifyFileLibraryWeatherCode(2)).toEqual({
    kind: "partly-cloudy",
    label: "多云",
  });
  expect(classifyFileLibraryWeatherCode(45)).toEqual({
    kind: "fog",
    label: "有雾",
  });
  expect(classifyFileLibraryWeatherCode(63)).toEqual({
    kind: "rain",
    label: "有雨",
  });
  expect(classifyFileLibraryWeatherCode(75)).toEqual({
    kind: "snow",
    label: "有雪",
  });
  expect(classifyFileLibraryWeatherCode(95)).toEqual({
    kind: "storm",
    label: "雷暴",
  });
  expect(classifyFileLibraryWeatherCode(undefined)).toEqual({
    kind: "unknown",
    label: "暂无天气数据",
  });
});

Deno.test("HUD weather parser rejects malformed responses and aligns daily dates with codes", () => {
  expect(parseOpenMeteoHudWeather({ current: null })).toBeNull();
  expect(parseOpenMeteoHudWeather({
    current: {
      temperature_2m: 29.4,
      apparent_temperature: 31.8,
      weather_code: 80,
    },
    daily: {
      time: ["2026-08-20", "2026-08-21", "bad-date"],
      weather_code: [2, 80, 999],
    },
  })).toEqual({
    current: {
      temperature: 29.4,
      apparentTemperature: 31.8,
      weatherCode: 80,
    },
    dailyWeatherCodes: {
      "2026-08-20": 2,
      "2026-08-21": 80,
    },
  });
});

Deno.test("HUD weather request stays browser-direct and covers recent months plus the forecast window", () => {
  const url = new URL(buildOpenMeteoHudWeatherUrl(31.23, 121.47));

  expect(url.origin).toBe("https://api.open-meteo.com");
  expect(url.pathname).toBe("/v1/forecast");
  expect(url.searchParams.get("current")).toBe(
    "temperature_2m,apparent_temperature,weather_code",
  );
  expect(url.searchParams.get("daily")).toBe("weather_code");
  expect(url.searchParams.get("past_days")).toBe("92");
  expect(url.searchParams.get("forecast_days")).toBe("16");
  expect(url.searchParams.get("timezone")).toBe("auto");
});
