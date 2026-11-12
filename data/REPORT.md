# Placement Aptitude and Reasoning Practice Dataset

**Total: 1855 answer-indexed questions** (1543 quantitative, 188 reasoning, 124 verbal). The original 500–600 item practice target is exceeded.

## Counts by topic

| Category | Topic | Count |
|---|---|---:|
| quant | ages | 73 |
| quant | algebra | 37 |
| quant | area-volume | 54 |
| quant | averages | 52 |
| quant | bankers-discount | 5 |
| quant | boats-streams | 20 |
| quant | compound-interest | 52 |
| quant | data-interpretation | 74 |
| quant | geometry-mensuration | 1 |
| quant | hcf-lcm | 53 |
| quant | height-distance | 5 |
| quant | mixtures-alligation | 56 |
| quant | number-system | 161 |
| quant | other | 15 |
| quant | partnership | 39 |
| quant | percentages | 97 |
| quant | permutation-combination | 61 |
| quant | pipes-cisterns | 15 |
| quant | probability | 72 |
| quant | profit-loss | 65 |
| quant | races-games | 10 |
| quant | ratio-proportion | 68 |
| quant | simple-interest | 46 |
| quant | simplification | 233 |
| quant | stocks-shares | 5 |
| quant | surds-indices | 11 |
| quant | time-speed-distance | 63 |
| quant | time-work | 69 |
| quant | trains | 21 |
| quant | true-discount | 10 |
| reasoning | analogy | 9 |
| reasoning | blood-relations | 9 |
| reasoning | cause-effect | 10 |
| reasoning | classification-odd-one-out | 4 |
| reasoning | course-of-action | 10 |
| reasoning | critical-reasoning | 1 |
| reasoning | data-sufficiency | 9 |
| reasoning | direction-sense | 10 |
| reasoning | non-verbal | 22 |
| reasoning | number-series | 13 |
| reasoning | other | 16 |
| reasoning | puzzles | 10 |
| reasoning | seating-arrangement | 12 |
| reasoning | statement-argument | 10 |
| reasoning | statement-assumption | 10 |
| reasoning | statement-conclusion | 11 |
| reasoning | syllogism | 10 |
| reasoning | venn-diagrams | 12 |
| verbal | antonyms | 10 |
| verbal | fill-in-blanks | 5 |
| verbal | idioms-phrases | 5 |
| verbal | one-word-substitution | 14 |
| verbal | other | 29 |
| verbal | para-jumbles | 10 |
| verbal | reading-comprehension | 13 |
| verbal | sentence-completion | 10 |
| verbal | sentence-correction | 5 |
| verbal | spotting-errors | 4 |
| verbal | synonyms | 14 |
| verbal | verbal-analogy | 5 |

## Counts by source

| Source | Count |
|---|---:|
| CampusRecruitmentBook | 41 |
| cmp332 | 261 |
| freshersnow | 146 |
| indiabix | 466 |
| quantitative-aptitude-ebook | 937 |
| user-provided-pdf | 4 |

## Topics with fewer than 30 questions

- `quant/bankers-discount`: 5
- `quant/boats-streams`: 20
- `quant/geometry-mensuration`: 1
- `quant/height-distance`: 5
- `quant/other`: 15
- `quant/pipes-cisterns`: 15
- `quant/races-games`: 10
- `quant/stocks-shares`: 5
- `quant/surds-indices`: 11
- `quant/trains`: 21
- `quant/true-discount`: 10
- `reasoning/analogy`: 9
- `reasoning/blood-relations`: 9
- `reasoning/cause-effect`: 10
- `reasoning/classification-odd-one-out`: 4
- `reasoning/course-of-action`: 10
- `reasoning/critical-reasoning`: 1
- `reasoning/data-sufficiency`: 9
- `reasoning/direction-sense`: 10
- `reasoning/non-verbal`: 22
- `reasoning/number-series`: 13
- `reasoning/other`: 16
- `reasoning/puzzles`: 10
- `reasoning/seating-arrangement`: 12
- `reasoning/statement-argument`: 10
- `reasoning/statement-assumption`: 10
- `reasoning/statement-conclusion`: 11
- `reasoning/syllogism`: 10
- `reasoning/venn-diagrams`: 12
- `verbal/antonyms`: 10
- `verbal/fill-in-blanks`: 5
- `verbal/idioms-phrases`: 5
- `verbal/one-word-substitution`: 14
- `verbal/other`: 29
- `verbal/para-jumbles`: 10
- `verbal/reading-comprehension`: 13
- `verbal/sentence-completion`: 10
- `verbal/sentence-correction`: 5
- `verbal/spotting-errors`: 4
- `verbal/synonyms`: 14
- `verbal/verbal-analogy`: 5

## Visual, pattern, and Data Interpretation records

There are 36 image-dependent questions. Their `images` entries point to local files in `data/images/` where a local copy is available (46 local image references; 0 missing files). The four answer-verified questions from `aptitude-test.pdf` use cropped local page images that show the chart, compass, matrix, or currency table without exposing the printed solution. IndiaBIX Data Interpretation has 74 records; the table and bar-chart sets are stored as Markdown in the shared `passage` field so they work offline in an HTML practice page. The Wipro reasoning question set also includes marked number-series and pattern questions.

## Source coverage and limits

- **CMP332 Quantitative Aptitude:** 261 distinct answer-keyed assignment questions imported from 13 topic sets in the 246-page PDF. Source PDFs are in `data/sources/`; the importer is `scraper/import_cmp332.py`.
- **QUANTITATIVE APTITUTE FULL EBOOK.pdf:** all 676 pages were text-extracted. 937 distinct quantitative MCQs with parseable options and answers were imported across its topic sections, including Data Interpretation. 19 mismatched option letters were corrected where the printed answer value matched another choice; 12 unresolved key/solution conflicts were set aside in `data/ebook_rejected.json`. The repeatable importer is `scraper/import_full_ebook.py`.
- **CampusRecruitmentBook.pdf:** 41 answer-supported items: 31 Number System questions, eight Character Puzzle items (six with local diagram crops), and two Data Interpretation questions with their source chart values transcribed into an offline table. This PDF is a preview of 90 of 528 pages, so it is not the complete book.
- **CampusRecruitmentSolvedPapers.pdf:** retained in `data/sources/`; this partial copy contains DI question sets with answer explanations missing from the matching pages and chart-only prompts. Its accessible DI questions were reviewed but could not be keyed and paired with their charts reliably.
- **aptitude-test.pdf:** four answer-supported items imported. One reading-comprehension item was rejected because the printed solution does not address the visible question.
- **FreshersNow:** 146 marked-answer questions extracted from Wipro, Infosys, and Capgemini PDFs. Oracle PDFs are retained as references but not imported because they do not provide a clear answer key.
- **IndiaBIX:** 466 answer-marked records, including 74 Data Interpretation items. Five table/bar-chart exercise pages were normalized into complete Markdown tables and checked against their worked answers. Directly inaccessible pages remain in `data/scrape_log.json`.
- Pasted online notes with impossible or logically unsupported answer keys were not added as keyed questions.

## Sample records

### Quant

- `indiabix-trains-5f3ff143ae` — What is the length of a running train? I. The train crosses a man in 9 seconds. II. The train crosses a 240 metre long platform in 24 seconds. **Answer:** Both I and II are necessary to answer ([source](https://www.indiabix.com/aptitude/problems-on-trains/039001))
- `quantitative-ebook-p551-q38` — A train covers a distance of 720 km at a speed of 120
km/hr. How much time will it take to complete the
journey? **Answer:** 6 hours ([source](data/sources/QUANTITATIVE-APTITUDE-FULL-EBOOK.pdf#page=551))
- `campusrecruitmentbook-number-system-103` — What is the sum of the first 20 multiples of 12? **Answer:** 2520 ([source](data/sources/CampusRecruitmentBook.pdf#page=15))

### Reasoning

- `indiabix-number-series-983c219eb7` — 2, 7, 27, 107, 427, ? **Answer:** 1707 ([source](https://www.indiabix.com/verbal-reasoning/series-completion/073010))
- `freshersnow-wipro-reasoning-questions-and-answers-028` — Despotic : Tyranny :: Generous : ? **Answer:** Liberality ([source](https://www.freshersnow.com/wp-content/uploads/2019/03/Wipro-Reasoning-Questions-and-Answers.pdf))
- `indiabix-statement-assumption-e093212d3a` — Statement: "In order to bring punctuality in our office, we must provide conveyance allowance to our employees." - In charge of a company tells Personnel Manager. Assumptions: Conveyance allowance will not help in bringing punctuality. Discipline and reward should always go hand in hand. **Answer:** Only assumption II is implicit ([source](https://www.indiabix.com/logical-reasoning/statement-and-assumption/))

### Verbal

- `indiabix-fill-in-blanks-d7f8432fbb` — Catching the earlier train will give us the ...... to do some shopping. **Answer:** chance ([source](https://www.indiabix.com/verbal-ability/selecting-words/))
- `indiabix-antonyms-522d9c4280` — ENORMOUS **Answer:** Tiny ([source](https://www.indiabix.com/verbal-ability/antonyms/))
- `freshersnow-wipro-english-language-questions-and-answers-019` — Jab we first met at Delhi airport, .............. our flight to Srinagar, most of us were
strangers. **Answer:** an hour before we were to board
https://www.freshersnow.com/placement-papers-download/
---PAGE 7---
Wipro English Questions and Answers for freshers ([source](https://www.freshersnow.com/wp-content/uploads/2019/03/Wipro-English-Language-Questions-and-Answers.pdf))

## Validation

All three JSON files were checked against the category/topic/answer schema. Invalid records: 0. Rejected or duplicate records retained for audit: 1.

## Content audit (5 November 2026)

The question bank was rechecked after correcting answer keys, worked solutions, choice sets, two split FreshersNow prompts, scraped page-header/link contamination, and exact duplicate choices. The repeatable audit is `scraper/audit_bank.js`; it checks all 1,855 records for unique IDs, valid answer indices, populated questions and choices, source attribution, duplicate choices, explanation-to-option-letter conflicts, scrape debris, duplicate question wording, and missing local images.

Current audit result: **0 failed checks**, 46 image references resolve locally, and no duplicate question wording remains. **389 records have no usable worked explanation** (259 CMP332, 14 FreshersNow, 116 IndiaBIX); these include records where the source supplied no solution and 107 IndiaBIX boilerplate messages. Their answer keys remain available. The misleading boilerplate has been removed instead of being shown as if it were a solution; no explanations were invented.
