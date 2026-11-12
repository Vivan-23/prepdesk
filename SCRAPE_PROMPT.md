# Task: Build an aptitude / reasoning question dataset (personal study use)

You are scraping publicly viewable practice questions for aptitude, logical reasoning, verbal ability and cognitive tests used in job interviews and placement tests. The dataset is for one person's private offline practice and will not be republished.

Work in this folder: `c:\Users\vivan\OneDrive\Desktop\Projects\Aptiude`. Write all scraper code in `scraper/` and all output in `data/`.

## 1. Sources (do them in this order, skip any that block you or need a login)
1. indiabix.com (Aptitude, Logical Reasoning, Verbal Reasoning, Non-Verbal Reasoning, Verbal Ability, Data Interpretation)
2. examveda.com (Arithmetic Ability, Logical Reasoning, Verbal Reasoning, English, Data Interpretation)
3. sawaal.com (aptitude, reasoning, verbal sections)
4. prepinsta.com (only the free aptitude/reasoning question pages)
5. geeksforgeeks.org (aptitude and puzzles sections)
6. javatpoint.com / tpointtech.com (aptitude, reasoning)
7. lofoya.com
8. Any other free page you find that has MCQs with a marked correct answer

Do NOT get past paywalls, logins or captchas. If a site blocks you, log it and move on.

## 2. Topics to cover (map every question to exactly one of these `topic` slugs)
**quant:** percentages, profit-loss, simple-interest, compound-interest, ratio-proportion, partnership, averages, ages, mixtures-alligation, time-work, pipes-cisterns, time-speed-distance, trains, boats-streams, number-system, hcf-lcm, simplification, surds-indices, logarithms, algebra, permutation-combination, probability, geometry-mensuration, area-volume, calendars, clocks, races-games, stocks-shares, true-discount, bankers-discount, height-distance, data-interpretation
**reasoning:** number-series, letter-series, analogy, classification-odd-one-out, coding-decoding, blood-relations, direction-sense, seating-arrangement, puzzles, syllogism, statement-conclusion, statement-assumption, statement-argument, cause-effect, course-of-action, data-sufficiency, input-output, ranking-order, venn-diagrams, cubes-dice, mirror-water-images, non-verbal, critical-reasoning
**verbal:** synonyms, antonyms, sentence-correction, spotting-errors, fill-in-blanks, para-jumbles, reading-comprehension, idioms-phrases, one-word-substitution, sentence-completion, verbal-analogy

If something truly fits none of them, use `other` and put the site's own topic name in `source_topic`.

## 3. Output format (follow exactly)
One JSON file per category: `data/quant.json`, `data/reasoning.json`, `data/verbal.json`. Each file is a JSON array of objects like this:

```json
{
  "id": "indiabix-percentages-0042",
  "category": "quant",
  "topic": "percentages",
  "source_topic": "Percentage",
  "difficulty": "easy | medium | hard | null",
  "question": "Plain text of the question. Keep line breaks as \\n.",
  "passage": "Shared passage/table/data for RC or DI sets, else null",
  "options": ["option A text", "option B text", "option C text", "option D text"],
  "answer": 2,
  "explanation": "Solution text from the page, or null if none",
  "images": ["https://... (only if the question/options need an image), else []"],
  "source": "indiabix",
  "url": "https://exact page the question came from"
}
```

Rules:
- `answer` is the **0-based index** into `options`. Check it against the site's marked answer, not a guess.
- Remove "A.", "(b)" etc. from the start of options.
- Turn HTML into clean text. Keep math readable (for example `x^2`, `√3`, `3/4`). Keep tables as Markdown inside `question` or `passage`.
- For RC and DI, repeat the shared `passage` on every question in the set.
- If a question needs an image to be answered, set `images` to the image URLs and also download each one to `data/images/<id>-<n>.<ext>`.
- Leave out questions that have no clear correct answer or fewer than 2 options.

## 4. Dedupe and check
- Remove duplicates across sources: lowercase the question, strip whitespace and punctuation, and compare. Keep the copy that has an explanation.
- Check every record against the schema. Write the records that fail to `data/rejected.json`, with a `reason` field.

## 5. Being polite and robust
- Wait 1–2 seconds between requests to the same site. Use one connection per site and a normal browser User-Agent string.
- Cache the raw HTML in `scraper/cache/` so a re-run doesn't fetch pages again. Make the scraper resumable.
- Use Python (requests + BeautifulSoup; Playwright only if a page renders with JS).

## 6. Final report
Write `data/REPORT.md` with:
- the total question count, plus counts per category, per topic and per source
- topics with fewer than 30 questions (I'll fill those with generated questions)
- sites you skipped or that blocked you, and why
- 3 random sample records from each category, so they can be checked by hand

Aim for as many questions as you can get, ideally 10,000 or more. Coverage of every topic matters more than piling up thousands of questions on a single topic.
