/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const FEED = "https://letterboxd.com/michaeldunner/rss/";
const ALLOWED = [
  "https://michaeldunne.ca",
  "https://www.michaeldunne.ca",
  "http://localhost:5173",
];

interface LetterboxdFilm {
  title: string;
  year: string | null;
  rating: string | null; // e.g. "3.5"
  stars: string | null; // e.g. "★★★½"
  watchedDate: string | null;
  link: string | null;
  poster: string | null;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  };
}

function toStars(rating: string): string | null {
  const n = parseFloat(rating);
  if (Number.isNaN(n)) return null;
  return "★".repeat(Math.floor(n)) + (n % 1 ? "½" : "");
}

function getTag(item: string, name: string): string | null {
  const re = new RegExp(
    `<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`,
  );
  return item.match(re)?.[1]?.trim() ?? null;
}

function parseLatestFilm(xml: string): LetterboxdFilm | null {
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = match[1] ?? "";

    const title = getTag(item, "letterboxd:filmTitle");
    if (!title) continue; // skip list entries etc.

    const rating = getTag(item, "letterboxd:memberRating");
    return {
      title,
      year: getTag(item, "letterboxd:filmYear"),
      rating,
      stars: rating ? toStars(rating) : null,
      watchedDate: getTag(item, "letterboxd:watchedDate"),
      link: getTag(item, "link"),
      poster: item.match(/<img src="([^"]+)"/)?.[1] ?? null,
    };
  }
  return null;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const cors = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    try {
      const res = await fetch(FEED, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; michaeldunne.ca feed fetcher)",
        },
        cf: { cacheTtl: 900, cacheEverything: true },
      });
      if (!res.ok) throw new Error(`Upstream returned ${res.status}`);

      const film = parseLatestFilm(await res.text());
      if (!film) {
        return Response.json(
          { error: "No films found" },
          { status: 404, headers: cors },
        );
      }

      return Response.json(film, {
        headers: { ...cors, "Cache-Control": "public, max-age=900" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json(
        { error: message },
        { status: 502, headers: cors },
      );
    }
  },
} satisfies ExportedHandler;
