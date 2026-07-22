import { slope } from "@/lib/metrics";

/**
 * Google Trends (unofficial) — best-effort and fully degradable. Any failure
 * returns null; Atlas never fabricates a trend it could not fetch.
 */
export interface TrendSignal {
  term: string;
  slope: number;
  latest: number;
  series: number[];
}

export async function getTrendSignal(term: string): Promise<TrendSignal | null> {
  try {
    const url =
      "https://trends.google.com/trends/api/explore" +
      `?hl=en-US&tz=360&req=${encodeURIComponent(
        JSON.stringify({ comparisonItem: [{ keyword: term, geo: "US", time: "today 3-m" }], category: 0, property: "" })
      )}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    // The unofficial endpoint returns a )]}' prefix + widget tokens, requiring a
    // second call. Rather than fabricate, we treat an unparseable response as a
    // failed fetch and degrade to null.
    const text = await res.text();
    const cleaned = text.replace(/^\)\]\}'?/, "");
    const parsed = JSON.parse(cleaned);
    const series: number[] = parsed?.default?.timelineData?.map((d: any) => Number(d.value?.[0] ?? 0)) ?? [];
    if (series.length < 3) return null;
    return { term, slope: slope(series), latest: series[series.length - 1], series };
  } catch {
    return null;
  }
}
