const LLAMA_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Default categories if client doesn't specify any
const DEFAULT_CATEGORIES = [
  "Bullishness",
  "Fear",
  "Hype",
  "Uncertainty",
  "Long-term conviction",
];

// Extra flavor categories for /lucky
const LUCKY_FLAVOR_CATEGORIES = [...DEFAULT_CATEGORIES, "Funny", "Random"];

const LUCKY_TOPICS = [
  "markets today",
  "crypto volatility",
  "tech stocks and earnings",
  "AI bubble",
  "energy sector and oil",
  "Fed decisions and interest rates",
  "SPY and overall market sentiment",
  "HFT firms",
  "market manipulation"
];

// Simple helper to pick a random element
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper for random ints in [min, max]
function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Build a random flavor profile for lucky tweets
function buildRandomFlavorProfile() {
  return LUCKY_FLAVOR_CATEGORIES.map((name) => ({
    name,
    score: randomIntInclusive(0, 10),
  }));
}

// JSON Schema for Workers AI JSON Mode:
// - explanation: overall one-sentence analysis
// - categories: name + score
const SENTIMENT_SCHEMA = {
  type: "object",
  properties: {
    explanation: {
      type: "string",
      description:
        "One-sentence overall explanation of the tweet sentiment across all categories.",
    },
    categories: {
      type: "array",
      description: "Per-category scores for the requested analysis dimensions.",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Category name exactly as provided in the input.",
          },
          score: {
            type: "integer",
            description:
              "Category intensity from 0 (not present) to 10 (extremely strong).",
            minimum: 0,
            maximum: 10,
          },
        },
        required: ["name", "score"],
        additionalProperties: false,
      },
    },
  },
  required: ["explanation", "categories"],
  additionalProperties: false,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // --- CORS preflight for /sentiment and /lucky ---
    if ((path === "/sentiment" || path === "/lucky") && method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // --- POST /sentiment ---
    if (path === "/sentiment" && method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      // Parse tweets from body
      let tweets = [];
      if (Array.isArray(body?.tweets)) tweets = body.tweets;
      else if (typeof body?.tweet === "string") tweets = [body.tweet];
      else if (typeof body?.text === "string") tweets = [body.text];

      tweets = tweets
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => t.length > 0);

      if (tweets.length === 0) {
        return json(
          { error: "No valid tweets found. Provide 'tweet' or 'tweets'." },
          400
        );
      }

      // Parse categories
      let categories = [];
      if (Array.isArray(body?.categories)) {
        categories = body.categories
          .map((c) => (typeof c === "string" ? c.trim() : ""))
          .filter((c) => c.length > 0);
      }
      if (categories.length === 0) categories = DEFAULT_CATEGORIES.slice();

      // De-duplicate and cap length
      categories = Array.from(new Set(categories)).slice(0, 8);

      const results = [];

      // --- Process each tweet ---
      for (let i = 0; i < tweets.length; i++) {
        const text = tweets[i];

        const messages = [
          {
            role: "system",
            content: [
              "You are a precise classifier for financial tweets.",
              "You MUST output a JSON object that matches the provided JSON schema.",
              "",
              "Per-category analysis:",
              "- You will be given a list of categories (e.g., Bullishness, Fear, Hype).",
              "- For each category, output exactly one entry in the 'categories' array.",
              "- Each entry must have 'name' equal to the input category name.",
              "- Each entry must have 'score' as an integer from 0 to 10.",
              "",
              "Overall explanation:",
              "- Provide exactly ONE sentence summarizing the tweet's sentiment across all categories.",
              "- It MUST be concise, factual, and directly reference the tweet content.",
              "- It MUST be 10-30 words and contain a summary of your overall analysis.",
              "",
              "IMPORTANT:",
              "- The 'categories' array must contain ALL categories provided in the input, no more and no less.",
              "- Do NOT add categories.",
              "- Do NOT output anything except valid JSON that fits the schema."
            ].join(" "),
          },
          {
            role: "user",
            content:
              `Tweet: "${text}"\n\n` +
              `Categories: ${categories.join(", ")}\n\n` +
              "Return ONLY valid JSON according to the schema.",
          },
        ];

        let aiResponse;
        try {
          aiResponse = await env.AI.run(LLAMA_MODEL, {
            messages,
            temperature: 0,
            max_tokens: 256,
            response_format: {
              type: "json_schema",
              json_schema: SENTIMENT_SCHEMA,
            },
          });
        } catch (err) {
          console.error("AI error:", err);
          results.push({
            index: i,
            text,
            explanation: null,
            categories: [],
            raw: null,
            error: "AI call failed",
          });
          continue;
        }

        const payload = aiResponse?.response;
        let explanation = null;
        let categoryItems = [];

        if (payload && typeof payload === "object") {
          if (typeof payload.explanation === "string") {
            explanation = payload.explanation;
          }

          if (Array.isArray(payload.categories)) {
            // Reorder categories to match the requested order
            categoryItems = categories.map((cat) => {
              const match = payload.categories.find(
                (c) => c && typeof c.name === "string" && c.name === cat
              );
              const score =
                typeof match?.score === "number"
                  ? Math.min(10, Math.max(0, Math.round(match.score)))
                  : null;
              return { name: cat, score };
            });
          } else {
            categoryItems = categories.map((name) => ({
              name,
              score: null,
            }));
          }
        } else {
          explanation = null;
          categoryItems = categories.map((name) => ({
            name,
            score: null,
          }));
        }

        results.push({
          index: i,
          text,
          explanation,
          categories: categoryItems,
          raw: payload,
        });
      }

      const summary = buildSummary(results, categories);

      return json(
        {
          model: LLAMA_MODEL,
          requestedCategories: categories,
          count: results.length,
          results,
          summary,
        },
        200
      );
    }

        // --- POST /lucky ---
    if (path === "/lucky" && method === "POST") {
      let seed = randomChoice(LUCKY_TOPICS);

      try {
        const body = await request.json();
    
        // If user provides a seed explicitly, override the random one
        if (typeof body?.seed === "string" && body.seed.trim().length > 0) {
          seed = body.seed.trim();
        }
      } catch {
        // ignore JSON parse errors – keep the random seed
      }

      // Build a random flavor profile using the default categories + funny + random
      const flavorProfile = buildRandomFlavorProfile();
      const flavorLines = flavorProfile
        .map(({ name, score }) => `${name}: ${score}/10`)
        .join("\n");

      const messages = [
        {
          role: "system",
          content: [
            "You generate realistic but fictional financial tweets.",
            "The tweet should sound like a retail trader commenting on markets or a specific stock, or something a touch random.",
            "Do not give financial advice.",
            "Do not use emojis or hashtags.",
            "Keep it under 25 words.",
            "",
            "You are given a random 'flavor profile' of categories with intensity scores from 0 to 10.",
            "Write the tweet so that, overall, it roughly matches these intensities.",
            "0 means not present at all, 10 means extremely strong.",
            "",
            "Flavor profile:",
            flavorLines,
            "",
            "Return only the tweet text with no quotes or extra commentary."
          ].join(" "),
        },
        {
          role: "user",
          content: `Generate one tweet about: ${seed}`,
        },
      ];

      try {
        const aiResponse = await env.AI.run(LLAMA_MODEL, {
          messages,
          temperature: 0.9, // slightly higher to lean into the flavor
          max_tokens: 64,
        });

        // Workers AI usually returns { response: "..." }
        let tweet =
          typeof aiResponse?.response === "string"
            ? aiResponse.response
            : String(aiResponse || "");

        tweet = tweet.trim();
        // Strip outer quotes if model added them
        if (
          (tweet.startsWith('"') && tweet.endsWith('"')) ||
          (tweet.startsWith("'") && tweet.endsWith("'"))
        ) {
          tweet = tweet.slice(1, -1).trim();
        }

        // Also return the flavorProfile so the frontend can show it
        return json({ tweet, flavorProfile }, 200);
      } catch (err) {
        console.error("AI error in /lucky:", err);
        return json({ error: "AI call failed generating tweet" }, 500);
      }
    }


    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};

// ---- Helpers ----

function buildSummary(results, categories) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const totals = new Map();
  for (const name of categories) totals.set(name, { sum: 0, count: 0 });

  for (const r of results) {
    for (const c of r.categories || []) {
      const entry = totals.get(c.name);
      if (!entry) continue;
      if (typeof c.score === "number") {
        entry.sum += c.score;
        entry.count += 1;
      }
    }
  }

  const avgByCategory = {};
  for (const [name, { sum, count }] of totals.entries()) {
    avgByCategory[name] = count ? sum / count : null;
  }

  return { total: results.length, avgByCategory };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
