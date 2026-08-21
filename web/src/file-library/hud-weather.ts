export type FileLibraryCalendarDay = {
  day: number;
  dateKey: string;
  isToday: boolean;
};

export type FileLibraryCalendarMonth = {
  year: number;
  monthIndex: number;
  label: string;
  days: Array<FileLibraryCalendarDay | null>;
};

export type FileLibraryWeatherKind =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "storm"
  | "unknown";

export type FileLibraryWeatherCondition = {
  kind: FileLibraryWeatherKind;
  label: string;
};

export type FileLibraryHudWeather = {
  current: {
    temperature: number;
    apparentTemperature: number;
    weatherCode: number;
  };
  dailyWeatherCodes: Record<string, number>;
};

function formatCalendarDateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${
    String(day).padStart(2, "0")
  }`;
}

export function buildFileLibraryCalendarMonth(
  today: Date,
  monthOffset: number,
): FileLibraryCalendarMonth {
  const anchor = new Date(
    today.getFullYear(),
    today.getMonth() + Math.trunc(monthOffset),
    1,
  );
  const year = anchor.getFullYear();
  const monthIndex = anchor.getMonth();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const mondayFirstOffset = (anchor.getDay() + 6) % 7;
  const days: Array<FileLibraryCalendarDay | null> = Array.from(
    { length: 42 },
    () => null,
  );

  for (let day = 1; day <= dayCount; day += 1) {
    days[mondayFirstOffset + day - 1] = {
      day,
      dateKey: formatCalendarDateKey(year, monthIndex, day),
      isToday: year === today.getFullYear() &&
        monthIndex === today.getMonth() && day === today.getDate(),
    };
  }

  return {
    year,
    monthIndex,
    label: `${year} 年 ${monthIndex + 1} 月`,
    days,
  };
}

export function classifyFileLibraryWeatherCode(
  code: number | undefined,
): FileLibraryWeatherCondition {
  if (code === 0) return { kind: "clear", label: "晴" };
  if (code === 1 || code === 2) {
    return { kind: "partly-cloudy", label: "多云" };
  }
  if (code === 3) return { kind: "cloudy", label: "阴" };
  if (code === 45 || code === 48) return { kind: "fog", label: "有雾" };
  if (
    code !== undefined &&
    ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
  ) {
    return { kind: "rain", label: "有雨" };
  }
  if (
    code !== undefined &&
    ((code >= 71 && code <= 77) || code === 85 || code === 86)
  ) {
    return { kind: "snow", label: "有雪" };
  }
  if (code !== undefined && code >= 95 && code <= 99) {
    return { kind: "storm", label: "雷暴" };
  }
  return { kind: "unknown", label: "暂无天气数据" };
}

function isFiniteWeatherNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCalendarDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 &&
    parsed.getDate() === day;
}

export function parseOpenMeteoHudWeather(
  value: unknown,
): FileLibraryHudWeather | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const current = record.current;
  const daily = record.daily;
  if (!current || typeof current !== "object" || !daily || typeof daily !== "object") {
    return null;
  }

  const currentRecord = current as Record<string, unknown>;
  const temperature = currentRecord.temperature_2m;
  const apparentTemperature = currentRecord.apparent_temperature;
  const weatherCode = currentRecord.weather_code;
  if (
    !isFiniteWeatherNumber(temperature) ||
    !isFiniteWeatherNumber(apparentTemperature) ||
    !isFiniteWeatherNumber(weatherCode)
  ) {
    return null;
  }

  const dailyRecord = daily as Record<string, unknown>;
  const times = dailyRecord.time;
  const weatherCodes = dailyRecord.weather_code;
  if (!Array.isArray(times) || !Array.isArray(weatherCodes)) return null;

  const dailyWeatherCodes: Record<string, number> = {};
  for (let index = 0; index < Math.min(times.length, weatherCodes.length); index += 1) {
    const dateKey = times[index];
    const code = weatherCodes[index];
    if (
      isCalendarDateKey(dateKey) && isFiniteWeatherNumber(code) &&
      classifyFileLibraryWeatherCode(code).kind !== "unknown"
    ) {
      dailyWeatherCodes[dateKey] = code;
    }
  }

  return {
    current: {
      temperature,
      apparentTemperature,
      weatherCode,
    },
    dailyWeatherCodes,
  };
}

export function buildOpenMeteoHudWeatherUrl(
  latitude: number,
  longitude: number,
): string {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code",
  );
  url.searchParams.set("daily", "weather_code");
  url.searchParams.set("past_days", "92");
  url.searchParams.set("forecast_days", "16");
  url.searchParams.set("timezone", "auto");
  return url.toString();
}

export async function fetchOpenMeteoHudWeather(
  latitude: number,
  longitude: number,
  fetcher: typeof fetch = fetch,
): Promise<FileLibraryHudWeather> {
  const response = await fetcher(buildOpenMeteoHudWeatherUrl(latitude, longitude));
  if (!response.ok) throw new Error(`天气服务返回 ${response.status}`);
  const weather = parseOpenMeteoHudWeather(await response.json());
  if (!weather) throw new Error("天气服务响应格式无效");
  return weather;
}
