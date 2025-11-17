# Tweet Sentiment Analyzer

This project is a small end-to-end application that demonstrates category-based sentiment analysis for financial tweets using Cloudflare Workers and Workers AI. The system includes a Cloudflare Worker backend for scoring tweets, along with a lightweight frontend built as a static page.

The application supports two primary functions:

1. **Sentiment Scoring (`/sentiment`)**
   Accepts one or more tweets and assigns integer scores (0–10) for user-chosen categories such as Bullishness, Fear, Hype, and Uncertainty.
   The Worker uses Cloudflare’s Llama-3.3-70B model in JSON Schema mode to enforce structured output.
   Each tweet receives a per-category score and a single sentence explanation.

2. **Tweet Generation (`/lucky`)**
   Produces a short, fictional financial tweet based on a randomly selected topic.

The frontend provides input controls for entering or generating tweets, selecting analysis categories, and viewing results in a clear tabular format. Category averages are also summarized across all analyzed tweets.

---

## Features

- Cloudflare Workers backend for sentiment scoring and text generation
- Llama-3.3-70B model using structured JSON schema enforcement
- Configurable analysis categories, including custom user-defined dimensions
- Random topic selection and flavor-based tweet generation
- Responsive frontend with table-based results and category summaries
- Fully static deployment compatible with Cloudflare Pages

---

## Endpoints

### POST `/sentiment`
Request:
```json
{
  "tweets": ["TSLA ripping today", "Market looks weak"],
  "categories": ["Bullishness", "Fear", "Hype"]
}
```

Response contains structured JSON including per-tweet results, explanations, and category averages.

### POST `/lucky`
Generates a fictional tweet based on a random topic. The response includes the generated text and the topic used.
