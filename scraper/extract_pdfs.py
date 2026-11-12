"""Extract clearly marked MCQs from locally cached FreshersNow PDF papers."""
from __future__ import annotations
import json, re, unicodedata
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCES = ROOT / "data" / "sources"
PDFS = {
 "Wipro-Aptitude-Questions-and-Answers-Set-I.pdf": ("quant", "Wipro Aptitude Set I", "https://www.freshersnow.com/wp-content/uploads/2019/03/Wipro-Aptitude-Questions-and-Answers-Set-I.pdf"),
 "Wipro-Aptitude-Questions-and-Answers-Set-II.pdf": ("quant", "Wipro Aptitude Set II", "https://www.freshersnow.com/wp-content/uploads/2019/03/Wipro-Aptitude-Questions-and-Answers-Set-II.pdf"),
 "Wipro-English-Language-Questions-and-Answers.pdf": ("verbal", "Wipro English", "https://www.freshersnow.com/wp-content/uploads/2019/03/Wipro-English-Language-Questions-and-Answers.pdf"),
 "Wipro-Reasoning-Questions-and-Answers.pdf": ("reasoning", "Wipro Reasoning", "https://www.freshersnow.com/wp-content/uploads/2019/03/Wipro-Reasoning-Questions-and-Answers.pdf"),
 "Infosys-Aptitude-Questions-and-Answers.pdf": ("quant", "Infosys Aptitude", "https://www.freshersnow.com/wp-content/uploads/2019/03/Infosys-Aptitude-Questions-and-Answers.pdf"),
 "Capgemini-Aptitude-Questions-and-Answers.pdf": ("quant", "Capgemini Aptitude", "https://www.freshersnow.com/wp-content/uploads/2019/03/Capgemini-Aptitude-Questions-and-Answers.pdf"),
}
START = re.compile(r"(?m)^\s*(\d{1,3})\s*[.)]\s+")
ANS = re.compile(r"(?im)^\s*Answer\s*[-:–]\s*([A-E])\s*[.)]?\s*(.*?)\s*$")
OPT = re.compile(r"(?i)(?:^|\s)([A-E])[.)]\s*")

def clean(s: str) -> str:
    s = unicodedata.normalize("NFKC", s.replace("\x00", " ").replace("\u200b", " "))
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n+ *", "\n", s)
    return s.strip()

def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.casefold())

def topic_for(cat: str, q: str) -> str:
    x = q.casefold()
    rules = {
      "quant": [("time-work", ["work in", "work together", "complete a work", "men to do work", "efficien"]), ("boats-streams", ["boat", "row", "stream", "upstream", "downstream"]), ("trains", ["train", "platform", "crosses a pole"]), ("time-speed-distance", ["speed", "distance", "km/hr", "kmph", "journey"]), ("simple-interest", ["simple interest"]), ("compound-interest", ["compound interest"]), ("profit-loss", ["profit", "loss", "cost price", "selling price", "gain percent"]), ("partnership", ["partnership", "contributes", "invested", "share in the profit"]), ("averages", ["average", "mean proportion"]), ("ages", ["age of", "years old", "father and son"]), ("ratio-proportion", ["ratio", "proportion"]), ("probability", ["probability", "at random", "chance that"]), ("permutation-combination", ["permutation", "combination", "ways are there", "arrange the letters"]), ("hcf-lcm", ["least common", "l.c.m", "h.c.f", "hcf", "lcm", "perfect square number which is divisible"]), ("area-volume", ["area", "volume", "perimeter", "surface area", "fence round"]), ("clocks", ["clock", "o'clock", "hands coincide", "hour hand"]), ("data-interpretation", ["following table", "following graph", "bar chart", "pie chart", "table gives", "refer to the figure"]), ("number-system", ["digits", "divisible", "remainder", "number of digits"]), ("surds-indices", ["root", "√", "surds", "indices", "power of"]), ("algebra", ["value of x", "equation", "quadratic", "f(x)"]), ("mixtures-alligation", ["mixture", "mix", "milk and water", "alligation"]), ("races-games", ["race", "beats", "head start", "runs a race"]), ("simplification", ["simplify", "evaluate", "value of ("])],
      "reasoning": [("number-series", ["series", "sequence", "next number", "missing number"]), ("letter-series", ["letter series", "alphabet series"]), ("blood-relations", ["related to", "son of", "daughter of", "mother's", "father's", "pointing to"]), ("classification-odd-one-out", ["least related", "odd one", "does not belong", "not belong"]), ("analogy", ["analogy", "::", "is to", "relationship between"]), ("coding-decoding", ["coded", "code language", "coding", "decoding"]), ("direction-sense", ["north", "south", "east", "west", "direction"]), ("seating-arrangement", ["seated", "sitting", "arrangement", "row of"]), ("syllogism", ["conclusions", "statements", "syllogism"]), ("data-sufficiency", ["statement-1", "statement 1", "sufficient to answer", "data sufficient"]), ("critical-reasoning", ["passage", "inferred", "implied", "argument", "conclusion"]), ("puzzles", ["puzzle", "arrangement", "schedule"]), ("ranking-order", ["rank", "position", "order"]), ("cause-effect", ["cause and effect", "cause", "effect"]), ("statement-conclusion", ["conclusion follows", "conclusions follow", "statement:"]), ("input-output", ["input", "output", "step i"]), ("venn-diagrams", ["venn", "diagram"]), ("cubes-dice", ["dice", "cube"]), ("non-verbal", ["figure", "mirror image", "water image"]), ("course-of-action", ["course of action", "action follows"]), ("statement-assumption", ["assumption", "assumptions"]), ("statement-argument", ["argument", "strong", "weak"]), ("letter-series", ["letters"]), ("classification-odd-one-out", ["four of the following five"])]
    }
    for topic, terms in rules.get(cat, []):
        if any(term in x for term in terms): return topic
    return {"quant":"other","reasoning":"other","verbal":"other"}[cat]

def parse_pdf(file: Path, cat: str, source_topic: str, url: str) -> list[dict]:
    reader = PdfReader(str(file))
    pages = [clean(p.extract_text() or "") for p in reader.pages]
    whole = "\n".join(f"\n---PAGE {i+1}---\n{p}" for i,p in enumerate(pages))
    starts = list(START.finditer(whole))
    out = []
    for i,m in enumerate(starts):
        block = whole[m.start(): starts[i+1].start() if i+1 < len(starts) else len(whole)]
        ansm = ANS.search(block)
        if not ansm: continue
        answer_letter = ansm.group(1).upper()
        before = block[:ansm.start()]
        # Strip page delimiters and the question number, preserving wrapped stems.
        before = re.sub(r"^\s*---PAGE\s+\d+---\s*", "", before)
        before = re.sub(r"^\s*\d{1,3}\s*[.)]\s*", "", before, count=1)
        # Extract option lines from the first A-E choice onwards.
        option_lines = list(OPT.finditer(before))
        if len(option_lines) < 2: continue
        # Only parse after the initial option start; keep continuation lines with the current choice.
        first = option_lines[0]
        stem = clean(before[:first.start()])
        tail = before[first.start():]
        marks = list(OPT.finditer(tail))
        opts = []
        for j,mark in enumerate(marks):
            end = marks[j+1].start() if j+1 < len(marks) else len(tail)
            # The first marker may consume its leading separator; only the option body follows.
            body = tail[mark.end():end]
            body = clean(body)
            if body: opts.append(body)
        if len(opts) < 2 or ord(answer_letter)-65 >= len(opts): continue
        stem = clean(stem)
        if not stem: continue
        # Remove any trailing page title/URL and any partial answer heading.
        stem = re.sub(r"(?is)https?://\S+", "", stem).strip()
        explm = re.search(r"(?is)Explanation\s*:\s*(.*)$", block[ansm.end():])
        explanation = clean(explm.group(1)) if explm else None
        if explanation:
            explanation = re.sub(r"(?is)https?://\S+", "", explanation).strip() or None
        # Drop passage questions when the PDF does not give the passage in the same question.
        if cat == "verbal" and re.search(r"\b(pass(?:age|age above)|according to the passage|based on the following passage)\b", stem, re.I):
            continue
        num = int(m.group(1))
        ident = f"freshersnow-{file.stem.lower()}-{num:03d}"
        out.append({"id": ident, "category": cat, "topic": topic_for(cat, stem), "source_topic": source_topic, "difficulty": None, "question": stem, "passage": None, "options": opts, "answer": ord(answer_letter)-65, "explanation": explanation, "images": [], "source": "freshersnow", "url": url})
    return out

def main():
    all_in = []
    for filename,(cat,source_topic,url) in PDFS.items():
        path = SOURCES / filename
        if path.exists():
            rows = parse_pdf(path,cat,source_topic,url)
            print(filename, len(rows))
            all_in.extend(rows)
    for cat in ("quant","reasoning","verbal"):
        path = DATA / f"{cat}.json"
        old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        seen = {norm(r["question"]): r for r in old}
        for r in (x for x in all_in if x["category"] == cat):
            k = norm(r["question"])
            if k not in seen or (not seen[k].get("explanation") and r.get("explanation")):
                seen[k] = r
        path.write_text(json.dumps(list(seen.values()),ensure_ascii=False,indent=2),encoding="utf-8")

    # Import only mathematically/logically sound, answer-supported items from the
    # user's pasted practice set. Several supplied key entries are incorrect.
    user_url = "user-pasted-practice-set"
    additions = [
      {"id":"user-basic-mathematics-001","category":"quant","topic":"percentages","source_topic":"Basic Mathematics Aptitude Questions","difficulty":"easy","question":"If the price of a shirt is increased by 20%, by what percentage should its consumption be reduced so that expenditure remains the same?","passage":None,"options":["16.67%","14.32%","16.50%","12.84%"],"answer":0,"explanation":"Let original price be P and quantity Q. To keep expenditure constant, new quantity is Q/1.2. The reduction is 1 - 1/1.2 = 1/6 = 16.67%.","images":[],"source":"user-pasted-practice-set","url":user_url},
      {"id":"user-basic-mathematics-002","category":"quant","topic":"profit-loss","source_topic":"Basic Mathematics Aptitude Questions","difficulty":"easy","question":"A shopkeeper sells an article at a profit of 20%. If its cost price is $250, what is the selling price?","passage":None,"options":["$500","$300","$50","$450"],"answer":1,"explanation":"Selling price = $250 × 1.20 = $300.","images":[],"source":"user-pasted-practice-set","url":user_url},
      {"id":"user-basic-mathematics-003","category":"quant","topic":"probability","source_topic":"Basic Mathematics Aptitude Questions","difficulty":"easy","question":"A bag contains 4 red balls and 6 blue balls. Two balls are drawn at random without replacement. What is the probability that both are red?","passage":None,"options":["1/3","4/5","2/15","6/21"],"answer":2,"explanation":"The probability is (4/10) × (3/9) = 12/90 = 2/15.","images":[],"source":"user-pasted-practice-set","url":user_url},
      {"id":"user-basic-mathematics-004","category":"quant","topic":"time-work","source_topic":"Basic Mathematics Aptitude Questions","difficulty":"easy","question":"If 12 workers can build a wall in 9 days, how many days will 8 workers take to build the same wall at the same rate?","passage":None,"options":["12 days","10 days","8 days","13.5 days"],"answer":3,"explanation":"The work is 12 × 9 = 108 worker-days. With 8 workers, time = 108/8 = 13.5 days.","images":[],"source":"user-pasted-practice-set","url":user_url},
      {"id":"user-verbal-reasoning-001","category":"reasoning","topic":"statement-conclusion","source_topic":"Verbal Reasoning Aptitude Questions with Answers","difficulty":"easy","question":"Statements: All cats are mammals. Some mammals are furry. Which conclusion follows necessarily?","passage":None,"options":["All mammals are furry.","Some cats are furry.","Some furry animals are cats.","All furry animals are mammals.","None of the above."],"answer":4,"explanation":"The furry mammals need not be cats, and the statements do not establish any furry cats. None of conclusions A–D follows necessarily.","images":[],"source":"user-pasted-practice-set","url":user_url},
      {"id":"user-verbal-analogy-001","category":"reasoning","topic":"analogy","source_topic":"Verbal Reasoning Aptitude Questions with Answers","difficulty":"easy","question":"A dog is to a puppy as a cat is to a:","passage":None,"options":["Kitten","Mouse","Lion","Cheetah","None of the above"],"answer":0,"explanation":"A puppy is a young dog; a kitten is a young cat.","images":[],"source":"user-pasted-practice-set","url":user_url},
      {"id":"user-informal-gathering-001","category":"reasoning","topic":"classification-odd-one-out","source_topic":"Aptitude Test Questions and Answers","difficulty":"easy","question":"An informal gathering occurs when a group of people gets together casually and in a relaxed manner. Which situation is the best example?","passage":None,"options":["A debating club meets on the first Sunday morning of every month.","After receiving news of a salary raise, Jay and a few colleagues go out for a quick dinner after work.","Meena sends 10 invitations for a bachelorette party for her elder sister.","Whenever she eats at a Chinese restaurant, Roop seems to run into Dibya."],"answer":1,"explanation":"The spontaneous dinner with colleagues is the casual, relaxed gathering.","images":[],"source":"user-pasted-practice-set","url":user_url},
      {"id":"user-hypotenuse-001","category":"quant","topic":"geometry-mensuration","source_topic":"Aptitude Test Questions and Answers","difficulty":"easy","question":"What is the hypotenuse?","passage":None,"options":["The longest side of a right-angled triangle.","A triangle with three equal sides.","The angle opposite the longest side of a triangle.","The sum of the interior angles of a triangle."],"answer":0,"explanation":"The hypotenuse is the side opposite the right angle and is the longest side of a right-angled triangle.","images":[],"source":"user-pasted-practice-set","url":user_url},
      {"id":"user-photosynthesis-001","category":"verbal","topic":"one-word-substitution","source_topic":"Aptitude Test Questions and Answers","difficulty":"easy","question":"Which definition best matches photosynthesis?","passage":None,"options":["The process of converting light energy into chemical energy.","The breakdown of glucose to release energy without oxygen.","The transport of water and nutrients through plant tissues.","The production of gametes for sexual reproduction."],"answer":0,"explanation":"Photosynthesis converts light energy into chemical energy stored in organic compounds.","images":[],"source":"user-pasted-practice-set","url":user_url},
      {"id":"user-exponential-growth-001","category":"verbal","topic":"sentence-completion","source_topic":"Aptitude Test Questions and Answers","difficulty":"easy","question":"Exponential growth is a rapid growth pattern in which:","passage":None,"options":["A population grows at a steady rate over time.","The growth rate decreases over time.","The population size increases exponentially.","The population declines because of limited resources."],"answer":2,"explanation":"Exponential growth means the population increases by a rate proportional to its current size.","images":[],"source":"user-pasted-practice-set","url":user_url},
    ]
    # Dedupe against all existing category records using normalized question text.
    for cat in ("quant","reasoning","verbal"):
        path=DATA/f"{cat}.json"
        rows=json.loads(path.read_text(encoding="utf-8"))
        seen={norm(r["question"]) for r in rows}
        for r in additions:
            if r["category"]==cat and norm(r["question"]) not in seen:
                rows.append(r); seen.add(norm(r["question"]))
        path.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf-8")

if __name__ == "__main__": main()
