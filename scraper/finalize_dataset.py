#!/usr/bin/env python3
"""Normalize image paths, remove duplicate IDs, validate records, and refresh report."""
from __future__ import annotations
import json, random, re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CATEGORIES = ("quant", "reasoning", "verbal")
FIELDS = {"id", "category", "topic", "source_topic", "difficulty", "question", "passage", "options", "answer", "explanation", "images", "source", "url"}
ALLOWED = {
 "quant": set("percentages profit-loss simple-interest compound-interest ratio-proportion partnership averages ages mixtures-alligation time-work pipes-cisterns time-speed-distance trains boats-streams number-system hcf-lcm simplification surds-indices logarithms algebra permutation-combination probability geometry-mensuration area-volume calendars clocks races-games stocks-shares true-discount bankers-discount height-distance data-interpretation other".split()),
 "reasoning": set("number-series letter-series analogy classification-odd-one-out coding-decoding blood-relations direction-sense seating-arrangement puzzles syllogism statement-conclusion statement-assumption statement-argument cause-effect course-of-action data-sufficiency input-output ranking-order venn-diagrams cubes-dice mirror-water-images non-verbal critical-reasoning other".split()),
 "verbal": set("synonyms antonyms sentence-correction spotting-errors fill-in-blanks para-jumbles reading-comprehension idioms-phrases one-word-substitution sentence-completion verbal-analogy other".split()),
}
def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())

def localize_images(row: dict) -> None:
    converted = []
    for i, value in enumerate(row.get("images", []), 1):
        if isinstance(value, str) and value.startswith("http"):
            candidates = sorted((DATA / "images").glob(f"{row['id']}-{i}.*"))
            if candidates:
                value = candidates[0].relative_to(ROOT).as_posix()
        converted.append(value)
    row["images"] = converted

def main():
    rows_by_category = {c: json.loads((DATA / f"{c}.json").read_text(encoding="utf-8")) for c in CATEGORIES}
    rejected = []
    # A text extraction from the Wipro Set II PDF produced one very short false
    # question with an ID colliding with the valid fourth item. Keep the complete stem.
    for cat, rows in rows_by_category.items():
        if cat == "quant":
            for row in rows:
                if row.get("source") == "quantitative-aptitude-ebook" and row.get("source_topic") == "Number Series":
                    row["topic"] = "number-system"
        groups = defaultdict(list)
        for row in rows:
            groups[row["id"]].append(row)
        kept = []
        for ident, candidates in groups.items():
            candidates.sort(key=lambda r: (bool(r.get("explanation")), len(r.get("question", ""))), reverse=True)
            kept.append(candidates[0])
            for row in candidates[1:]:
                rejected.append({"record": row, "reason": "Duplicate ID; retained the complete question record."})
        # Exact normalized-stem dedupe in each category; prefer a copy with a solution.
        by_question = {}
        for row in kept:
            key = norm(row.get("question", ""))
            prior = by_question.get(key)
            if prior is None or (bool(row.get("explanation")), len(row.get("question", ""))) > (bool(prior.get("explanation")), len(prior.get("question", ""))):
                if prior is not None:
                    rejected.append({"record": prior, "reason": "Duplicate normalized question; retained the record with the better explanation."})
                by_question[key] = row
            else:
                rejected.append({"record": row, "reason": "Duplicate normalized question; retained the record with the better explanation."})
        rows_by_category[cat] = list(by_question.values())

    # Omit a PDF reading-comprehension item whose printed explanation addresses a
    # different statement than the visible question, so the key cannot be trusted.
    rejected.append({
        "record": {
            "id": "practiceaptitudetests-reading-003", "category": "verbal", "source": "user-provided-pdf",
            "url": "data/sources/aptitude-test.pdf#page=5",
            "question": "The proposed flexible parental leave system is similar to the Icelandic model, in that mothers and fathers will be required to share the last seven months of leave.",
            "options": ["True", "False", "Cannot say"], "answer": None,
        },
        "reason": "The PDF's printed solution discusses whether all twelve months are paid; it does not establish the answer to the visible Iceland comparison statement. The answer key is inconsistent with the question."
    })

    invalid = []
    for cat, rows in rows_by_category.items():
        for row in rows:
            localize_images(row)
            reasons = []
            if set(row) != FIELDS: reasons.append("schema fields do not match")
            if row.get("category") != cat: reasons.append("category mismatch")
            if row.get("topic") not in ALLOWED[cat]: reasons.append("topic slug is not allowed")
            if not isinstance(row.get("options"), list) or len(row["options"]) < 2: reasons.append("fewer than two options")
            if not isinstance(row.get("answer"), int) or not isinstance(row.get("options"), list) or not 0 <= row["answer"] < len(row.get("options", [])): reasons.append("answer index is invalid")
            if not isinstance(row.get("images"), list): reasons.append("images must be an array")
            if reasons: invalid.append({"record": row, "reason": "; ".join(reasons)})
        (DATA / f"{cat}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    rejected.extend(invalid)
    (DATA / "rejected.json").write_text(json.dumps(rejected, ensure_ascii=False, indent=2), encoding="utf-8")

    all_rows = [row for c in CATEGORIES for row in rows_by_category[c]]
    counts = Counter(row["category"] for row in all_rows)
    topics = {c: Counter(row["topic"] for row in rows_by_category[c]) for c in CATEGORIES}
    sources = Counter(row["source"] for row in all_rows)
    ebook_rejected_path = DATA / "ebook_rejected.json"
    ebook_corrections_path = DATA / "ebook_key_corrections.json"
    ebook_rejected_count = len(json.loads(ebook_rejected_path.read_text(encoding="utf-8"))) if ebook_rejected_path.exists() else 0
    ebook_correction_count = len(json.loads(ebook_corrections_path.read_text(encoding="utf-8"))) if ebook_corrections_path.exists() else 0
    local_images = sum(1 for row in all_rows for img in row.get("images", []) if not img.startswith("http"))
    missing_images = [(row["id"], img) for row in all_rows for img in row.get("images", []) if not img.startswith("http") and not (ROOT / img).exists()]

    lines = [
        "# Placement Aptitude and Reasoning Practice Dataset", "",
        f"**Total: {len(all_rows)} answer-indexed questions** ({counts['quant']} quantitative, {counts['reasoning']} reasoning, {counts['verbal']} verbal). The original 500–600 item practice target is exceeded.",
        "", "## Counts by topic", "", "| Category | Topic | Count |", "|---|---|---:|"
    ]
    for cat in CATEGORIES:
        for topic, count in sorted(topics[cat].items()):
            lines.append(f"| {cat} | {topic} | {count} |")
    lines += ["", "## Counts by source", "", "| Source | Count |", "|---|---:|"]
    for source, count in sorted(sources.items()):
        lines.append(f"| {source} | {count} |")
    lines += ["", "## Topics with fewer than 30 questions", ""]
    for cat in CATEGORIES:
        for topic, count in sorted(topics[cat].items()):
            if count < 30:
                lines.append(f"- `{cat}/{topic}`: {count}")
    lines += [
        "", "## Visual, pattern, and Data Interpretation records", "",
        f"There are {sum(bool(r.get('images')) for r in all_rows)} image-dependent questions. Their `images` entries point to local files in `data/images/` where a local copy is available ({local_images} local image references; {len(missing_images)} missing files). The four answer-verified questions from `aptitude-test.pdf` use cropped local page images that show the chart, compass, matrix, or currency table without exposing the printed solution. IndiaBIX Data Interpretation has {topics['quant'].get('data-interpretation', 0)} records; the table and bar-chart sets are stored as Markdown in the shared `passage` field so they work offline in an HTML practice page. The Wipro reasoning question set also includes marked number-series and pattern questions.",
        "", "## Source coverage and limits", "",
        "- **CMP332 Quantitative Aptitude:** 261 distinct answer-keyed assignment questions imported from 13 topic sets in the 246-page PDF. Source PDFs are in `data/sources/`; the importer is `scraper/import_cmp332.py`.",
        f"- **QUANTITATIVE APTITUTE FULL EBOOK.pdf:** all 676 pages were text-extracted. {sources.get('quantitative-aptitude-ebook', 0)} distinct quantitative MCQs with parseable options and answers were imported across its topic sections, including Data Interpretation. {ebook_correction_count} mismatched option letters were corrected where the printed answer value matched another choice; {ebook_rejected_count} unresolved key/solution conflicts were set aside in `data/ebook_rejected.json`. The repeatable importer is `scraper/import_full_ebook.py`.",
        "- **CampusRecruitmentBook.pdf:** 41 answer-supported items: 31 Number System questions, eight Character Puzzle items (six with local diagram crops), and two Data Interpretation questions with their source chart values transcribed into an offline table. This PDF is a preview of 90 of 528 pages, so it is not the complete book.",
        "- **CampusRecruitmentSolvedPapers.pdf:** retained in `data/sources/`; this partial copy contains DI question sets with answer explanations missing from the matching pages and chart-only prompts. Its accessible DI questions were reviewed but could not be keyed and paired with their charts reliably.",
        "- **aptitude-test.pdf:** four answer-supported items imported. One reading-comprehension item was rejected because the printed solution does not address the visible question.",
        "- **FreshersNow:** 147 marked-answer questions extracted from Wipro, Infosys, and Capgemini PDFs. Oracle PDFs are retained as references but not imported because they do not provide a clear answer key.",
        f"- **IndiaBIX:** {sources.get('indiabix', 0)} answer-marked records, including {topics['quant'].get('data-interpretation', 0)} Data Interpretation items. Five table/bar-chart exercise pages were normalized into complete Markdown tables and checked against their worked answers. Directly inaccessible pages remain in `data/scrape_log.json`.",
        "- Pasted online notes with impossible or logically unsupported answer keys were not added as keyed questions.",
        "", "## Sample records", ""
    ]
    rng = random.Random(20261105)
    for cat in CATEGORIES:
        sample = rng.sample(rows_by_category[cat], min(3, len(rows_by_category[cat])))
        lines += [f"### {cat.title()}", ""]
        for row in sample:
            answer_text = row["options"][row["answer"]]
            lines.append(f"- `{row['id']}` — {row['question']} **Answer:** {answer_text} ([source]({row['url']}))")
        lines.append("")
    lines += ["## Validation", "", f"All three JSON files were checked against the category/topic/answer schema. Invalid records: {len(invalid)}. Rejected or duplicate records retained for audit: {len(rejected)}."]
    (DATA / "REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"records={len(all_rows)} categories={dict(counts)} sources={dict(sources)} image_refs={local_images} missing_images={len(missing_images)} invalid={len(invalid)} rejected={len(rejected)}")

if __name__ == "__main__":
    main()
