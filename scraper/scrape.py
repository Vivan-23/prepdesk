#!/usr/bin/env python3
"""Polite, cached IndiaBIX scraper for public MCQ pages with marked answers."""
from __future__ import annotations
import hashlib, json, re, sys, time, unicodedata
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper" / "_vendor"))
import requests
from bs4 import BeautifulSoup

CACHE = ROOT / "scraper" / "cache"
DATA = ROOT / "data"
IMAGES = DATA / "images"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
INDEXES = [
 "https://www.indiabix.com/aptitude/", "https://www.indiabix.com/logical-reasoning/",
 "https://www.indiabix.com/verbal-reasoning/", "https://www.indiabix.com/non-verbal-reasoning/",
 "https://www.indiabix.com/verbal-ability/", "https://www.indiabix.com/data-interpretation/",
]
ALIASES = {
 "percentage":"percentages", "profit-and-loss":"profit-loss", "simple-interest":"simple-interest",
 "compound-interest":"compound-interest", "ratio-and-proportion":"ratio-proportion", "partnership":"partnership",
 "average":"averages", "averages":"averages", "problems-on-ages":"ages", "ages":"ages",
 "mixtures-and-alligations":"mixtures-alligation", "mixtures-and-allegations":"mixtures-alligation",
 "time-and-work":"time-work", "pipes-and-cistern":"pipes-cisterns", "pipes-and-cisterns":"pipes-cisterns",
 "time-and-distance":"time-speed-distance", "problems-on-trains":"trains", "trains":"trains", "boats-and-streams":"boats-streams",
 "numbers":"number-system", "problems-on-numbers":"number-system", "hcf-and-lcm":"hcf-lcm", "simplification":"simplification",
 "surds-and-indices":"surds-indices", "logarithms":"logarithms", "algebra":"algebra", "permutation-and-combination":"permutation-combination",
 "permutations-and-combinations":"permutation-combination", "probability":"probability", "geometry":"geometry-mensuration",
 "areas":"area-volume", "volume-and-surface-area":"area-volume", "calendars":"calendars", "clocks":"clocks",
 "races-and-games":"races-games", "stocks-and-shares":"stocks-shares", "true-discount":"true-discount",
 "bankers-discount":"bankers-discount", "height-and-distance":"height-distance", "table-charts":"data-interpretation",
 "bar-charts":"data-interpretation", "pie-charts":"data-interpretation", "line-graphs":"data-interpretation",
 "data-interpretation":"data-interpretation", "series-completion":"number-series", "series":"number-series",
 "letter-series":"letter-series", "analogies":"analogy", "analogy":"analogy", "odd-man-out":"classification-odd-one-out",
 "classification":"classification-odd-one-out", "coding-decoding":"coding-decoding", "blood-relations":"blood-relations",
 "direction-sense-test":"direction-sense", "direction-sense":"direction-sense", "seating-arrangement":"seating-arrangement",
 "logical-problems":"puzzles", "puzzles":"puzzles", "syllogism":"syllogism", "statement-and-conclusion":"statement-conclusion",
 "statement-and-assumption":"statement-assumption", "statement-and-argument":"statement-argument", "cause-and-effect":"cause-effect",
 "course-of-action":"course-of-action", "data-sufficiency":"data-sufficiency", "input-output":"input-output",
 "ranking-test":"ranking-order", "ranking-order":"ranking-order", "venn-diagrams":"venn-diagrams", "cubes-and-dice":"cubes-dice",
 "mirror-images":"mirror-water-images", "water-images":"mirror-water-images", "non-verbal-reasoning":"non-verbal",
 "critical-reasoning":"critical-reasoning", "spotting-errors":"spotting-errors", "synonyms":"synonyms", "antonyms":"antonyms",
 "sentence-correction":"sentence-correction", "selecting-words":"fill-in-blanks", "fill-in-the-blanks":"fill-in-blanks",
 "ordering-of-sentences":"para-jumbles", "paragraph-formation":"para-jumbles", "comprehension":"reading-comprehension",
 "idioms-and-phrases":"idioms-phrases", "one-word-substitutes":"one-word-substitution", "completing-statements":"sentence-completion",
 "verbal-analogies":"verbal-analogy",
}
TOPIC_CATEGORY = {
 "percentages":"quant","profit-loss":"quant","simple-interest":"quant","compound-interest":"quant","ratio-proportion":"quant","partnership":"quant","averages":"quant","ages":"quant","mixtures-alligation":"quant","time-work":"quant","pipes-cisterns":"quant","time-speed-distance":"quant","trains":"quant","boats-streams":"quant","number-system":"quant","hcf-lcm":"quant","simplification":"quant","surds-indices":"quant","logarithms":"quant","algebra":"quant","permutation-combination":"quant","probability":"quant","geometry-mensuration":"quant","area-volume":"quant","calendars":"quant","clocks":"quant","races-games":"quant","stocks-shares":"quant","true-discount":"quant","bankers-discount":"quant","height-distance":"quant","data-interpretation":"quant",
 "number-series":"reasoning","letter-series":"reasoning","analogy":"reasoning","classification-odd-one-out":"reasoning","coding-decoding":"reasoning","blood-relations":"reasoning","direction-sense":"reasoning","seating-arrangement":"reasoning","puzzles":"reasoning","syllogism":"reasoning","statement-conclusion":"reasoning","statement-assumption":"reasoning","statement-argument":"reasoning","cause-effect":"reasoning","course-of-action":"reasoning","data-sufficiency":"reasoning","input-output":"reasoning","ranking-order":"reasoning","venn-diagrams":"reasoning","cubes-dice":"reasoning","mirror-water-images":"reasoning","non-verbal":"reasoning","critical-reasoning":"reasoning",
 "synonyms":"verbal","antonyms":"verbal","sentence-correction":"verbal","spotting-errors":"verbal","fill-in-blanks":"verbal","para-jumbles":"verbal","reading-comprehension":"verbal","idioms-phrases":"verbal","one-word-substitution":"verbal","sentence-completion":"verbal","verbal-analogy":"verbal",
}
LIMITS = {"quant": 280, "reasoning": 200, "verbal": 120}
PER_TOPIC_CAP = {"quant": 12, "reasoning": 9, "verbal": 10}

def tidy(s: str) -> str:
    s=unicodedata.normalize("NFKC",s.replace("\u00a0"," ").replace("\u200b"," "))
    return re.sub(r"\s+"," ",s).strip()

def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+","",s.casefold())

def topic_path(url: str) -> str | None:
    parts=[p for p in urlparse(url).path.split("/") if p]
    for p in parts:
        if p in ALIASES: return ALIASES[p]
    return None

def read_existing():
    rows=[]
    for c in ("quant","reasoning","verbal"):
        p=DATA/f"{c}.json"
        if p.exists(): rows += json.loads(p.read_text(encoding="utf-8"))
    return rows

def cached_get(url: str, session: requests.Session, last: dict) -> str:
    CACHE.mkdir(parents=True,exist_ok=True)
    key=hashlib.sha256(url.encode()).hexdigest()
    p=CACHE/f"{key}.html"
    if p.exists(): return p.read_text(encoding="utf-8")
    host=urlparse(url).netloc
    if last.get("host")==host: time.sleep(1.5)
    r=session.get(url,timeout=30)
    last["host"]=host
    r.raise_for_status()
    if any(k in r.url.lower() for k in ("captcha","login","subscribe")):
        raise RuntimeError("Access gate encountered at "+r.url)
    p.write_text(r.text,encoding="utf-8")
    return r.text

def extract_page(url: str, html: str, session: requests.Session, last: dict) -> tuple[list[dict],list[str]]:
    soup=BeautifulSoup(html,"html.parser")
    topic=topic_path(url)
    category=TOPIC_CATEGORY.get(topic or "")
    links=[]
    for a in soup.select("a[href]"):
        href=urljoin(url,a.get("href",""))
        href=urldefrag(href)[0]
        u=urlparse(href)
        if u.netloc=="www.indiabix.com" and topic_path(href) and "/discussion" not in u.path:
            links.append(href)
    rows=[]
    if not category or not topic: return rows,links
    source_topic=tidy((soup.select_one("h1") or soup.select_one("title") or soup).get_text(" ",strip=True))
    for n,box in enumerate(soup.select("div.bix-div-container"),1):
        qnode=box.select_one(".bix-td-qtxt")
        optnodes=box.select(".bix-td-option-val")
        ansnode=box.select_one(".bix-ans-option span[class*=option-svg-letter]")
        expnode=box.select_one(".bix-ans-description")
        if not qnode or len(optnodes)<2 or not ansnode: continue
        cls=" ".join(ansnode.get("class",[]))
        letter=re.search(r"option-svg-letter-([a-e])",cls,re.I)
        if not letter: continue
        options=[]
        for o in optnodes:
            for lab in o.select(".bix-td-option"): lab.decompose()
            options.append(tidy(o.get_text(" ",strip=True)))
        if not all(options) or ord(letter.group(1).lower())-97>=len(options): continue
        question=tidy(qnode.get_text(" ",strip=True))
        # If a necessary diagram is present, preserve its URL and cache a local copy.
        images=[]
        for img in qnode.select("img")+[im for o in optnodes for im in o.select("img")]:
            src=img.get("src") or img.get("data-src")
            if not src: continue
            image_url=urljoin(url,src); images.append(image_url)
        ident=f"indiabix-{topic}-{hashlib.sha1((url+str(n)).encode()).hexdigest()[:10]}"
        for i,image_url in enumerate(images,1):
            try:
                if last.get("host")==urlparse(image_url).netloc: time.sleep(1.5)
                ir=session.get(image_url,timeout=25); last["host"]=urlparse(image_url).netloc; ir.raise_for_status()
                ext=Path(urlparse(image_url).path).suffix or ".img"
                (IMAGES/f"{ident}-{i}{ext}").write_bytes(ir.content)
            except Exception: pass
        explanation=tidy(expnode.get_text(" ",strip=True)) if expnode else None
        explanation=re.sub(r"^Explanation:\s*","",explanation or "",flags=re.I).strip() or None
        rows.append({"id":ident,"category":category,"topic":topic,"source_topic":source_topic,"difficulty":None,"question":question,"passage":None,"options":options,"answer":ord(letter.group(1).lower())-97,"explanation":explanation,"images":images,"source":"indiabix","url":url})
    return rows,links

def save(records: list[dict]) -> None:
    for cat in ("quant","reasoning","verbal"):
        (DATA/f"{cat}.json").write_text(json.dumps([r for r in records if r["category"]==cat],ensure_ascii=False,indent=2),encoding="utf-8")

def main():
    DATA.mkdir(exist_ok=True)
    session=requests.Session(); session.headers.update({"User-Agent":UA})
    existing=read_existing(); bykey={norm(r["question"]):r for r in existing}
    q=[]; queued=set(INDEXES); visited=set(); last={}; counts={c:sum(1 for r in existing if r["category"]==c) for c in LIMITS}
    topic_counts={}
    for r in existing: topic_counts[r["topic"]]=topic_counts.get(r["topic"],0)+1
    errors=[]; max_pages=500
    while q or queued:
        if not q: q=list(queued); queued.clear()
        url=q.pop(0)
        if url in visited or len(visited)>=max_pages: continue
        visited.add(url)
        topic=topic_path(url); cat=TOPIC_CATEGORY.get(topic or "")
        if topic and cat and topic_counts.get(topic,0)>=PER_TOPIC_CAP[cat] and len(urlparse(url).path.strip("/").split("/"))>1:
            continue
        if cat and counts.get(cat,0)>=LIMITS[cat]: continue
        try:
            html=cached_get(url,session,last)
            rows,links=extract_page(url,html,session,last)
            for link in links:
                if link not in visited and link not in queued: queued.add(link)
            for r in rows:
                key=norm(r["question"])
                if not key: continue
                if key in bykey:
                    if not bykey[key].get("explanation") and r.get("explanation"): bykey[key]=r
                    continue
                bykey[key]=r; counts[r["category"]]+=1; topic_counts[r["topic"]]=topic_counts.get(r["topic"],0)+1
                print(r["category"],r["topic"],counts[r["category"]],r["url"])
            if len(visited)%25==0: save(list(bykey.values()))
        except Exception as e:
            errors.append({"url":url,"reason":str(e)})
            print("SKIP",url,str(e))
    save(list(bykey.values()))
    (DATA/"scrape_log.json").write_text(json.dumps({"pages_visited":len(visited),"counts":counts,"topic_counts":topic_counts,"errors":errors},ensure_ascii=False,indent=2),encoding="utf-8")
    print("DONE",len(bykey),counts,"pages",len(visited))

if __name__ == "__main__": main()
