/**
 * Weather / season signals. Weather via the US National Weather Service (no key,
 * best-effort). Season is a deterministic calendar signal — legitimate, not
 * fabricated data.
 */

export interface SeasonSignal {
  month: number;
  label: string;
  demand: "low" | "building" | "peak" | "tapering";
  score: number;
}

/** Landscaping-style seasonal demand curve, by month (1-12). */
export function seasonSignal(now: Date = new Date()): SeasonSignal {
  const m = now.getUTCMonth() + 1;
  const table: Record<number, { demand: SeasonSignal["demand"]; score: number; label: string }> = {
    1: { demand: "low", score: 0.2, label: "Winter — low demand" },
    2: { demand: "building", score: 0.4, label: "Late winter — planning starts" },
    3: { demand: "building", score: 0.7, label: "Early spring — demand building fast" },
    4: { demand: "peak", score: 0.95, label: "Spring — peak demand" },
    5: { demand: "peak", score: 1.0, label: "Late spring — peak demand" },
    6: { demand: "peak", score: 0.9, label: "Early summer — strong" },
    7: { demand: "tapering", score: 0.7, label: "Summer — steady" },
    8: { demand: "tapering", score: 0.6, label: "Late summer — tapering" },
    9: { demand: "building", score: 0.7, label: "Fall cleanup demand" },
    10: { demand: "building", score: 0.6, label: "Autumn — leaf season" },
    11: { demand: "tapering", score: 0.4, label: "Late fall — winding down" },
    12: { demand: "low", score: 0.2, label: "Winter — low demand" },
  };
  const t = table[m];
  return { month: m, label: t.label, demand: t.demand, score: t.score };
}

export interface WeatherSignal {
  label: string;
  detail: string;
}

export async function getWeather(lat: number, lon: number): Promise<WeatherSignal | null> {
  try {
    const point = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
      headers: { "User-Agent": "atlas-signals" },
      cache: "no-store",
    });
    if (!point.ok) return null;
    const pj = await point.json();
    const forecastUrl = pj?.properties?.forecast;
    if (!forecastUrl) return null;
    const fc = await fetch(forecastUrl, {
      headers: { "User-Agent": "atlas-signals" },
      cache: "no-store",
    });
    if (!fc.ok) return null;
    const fj = await fc.json();
    const period = fj?.properties?.periods?.[0];
    if (!period) return null;
    return { label: period.name, detail: period.detailedForecast };
  } catch {
    return null;
  }
}
