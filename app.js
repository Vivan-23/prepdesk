/* Prepdesk: a local-first placement practice app. Progress lives in IndexedDB. */
(() => {
  "use strict";
  const BANK_VERSION = "2026-11-05-1855-v5-interview";
  const DB_NAME = "prepdesk-local";
  const DB_VERSION = 1;
  const CATEGORIES = ["quant", "reasoning", "verbal"];
  const CATEGORY_LABEL = {quant:"Quantitative", reasoning:"Reasoning", verbal:"Verbal"};
  const DURATION_TARGETS = {20:15, 45:35, 120:90};
  const REVIEW_DAYS = [0,1,3,7,14,30,60];
  const FILES = ["data/quant.json?v=20261105-audited4", "data/reasoning.json?v=20261105-audited4", "data/verbal.json?v=20261105-audited4"];
  const $ = s => document.querySelector(s);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const localDateKey = date => { const d=new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  const prettyTopic = topic => String(topic||"other").replaceAll("-"," ").replace(/\b\w/g,c=>c.toUpperCase());
  const fmtDate = value => new Date(value).toLocaleDateString(undefined,{month:"short",day:"numeric"});
  const fmtLong = value => new Date(value).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
  const fmtDuration = seconds => { const mins=Math.max(0,Math.round((seconds||0)/60)); return mins>=60?`${Math.floor(mins/60)}h ${mins%60}m`:`${mins}m`; };
  const shuffle = array => { const a=[...array]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; };
  function balancedPick(pool,limit,topicFocused){
    const groups=new Map();for(const q of shuffle(pool)){const key=topicFocused?`${q.category}::${q.topic}`:q.category;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(q);}
    let keys=shuffle([...groups.keys()]),out=[];while(out.length<limit&&keys.length){const next=[];for(const key of keys){const q=groups.get(key).pop();if(q)out.push(q);if(groups.get(key).length)next.push(key);if(out.length>=limit)break;}keys=next;}return out;
  }
  const categoryText = category => CATEGORY_LABEL[category] || category;

  const state = {
    db:null, bank:[], bankById:new Map(), attempts:[], reviews:[], sessions:[], plans:[], settings:{},
    page:"dashboard", active:null, currentPlan:null, coachMessages:[], timerId:null, mobileOpen:false,
    selectedDuration:45, selectedCombo:"balanced", lastResult:null,
    interviewPrompts:[], interviewPrompt:null, interviewRecords:[], interviewCategory:"all", interviewBusy:false,
    interviewDraftTranscript:"", interviewDraftFeedback:"", interviewCopyStatus:"",
    readingRecords:[], readingDraftTitle:"", readingDraftUrl:"", readingDraftTranscript:"", readingDraftFeedback:"", readingCopyStatus:"", readingBusy:false
  };

  function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("Browser storage request failed"));});}
  function openDatabase(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains("questions")){const s=db.createObjectStore("questions",{keyPath:"id"});s.createIndex("category","category");s.createIndex("topic","topic");}
        if(!db.objectStoreNames.contains("attempts")){const s=db.createObjectStore("attempts",{keyPath:"id"});s.createIndex("questionId","questionId");s.createIndex("sessionId","sessionId");s.createIndex("answeredAt","answeredAt");}
        if(!db.objectStoreNames.contains("reviews")){const s=db.createObjectStore("reviews",{keyPath:"questionId"});s.createIndex("dueAt","dueAt");}
        if(!db.objectStoreNames.contains("sessions")){const s=db.createObjectStore("sessions",{keyPath:"id"});s.createIndex("status","status");s.createIndex("startedAt","startedAt");}
        if(!db.objectStoreNames.contains("plans")){const s=db.createObjectStore("plans",{keyPath:"id"});s.createIndex("createdAt","createdAt");}
        if(!db.objectStoreNames.contains("settings"))db.createObjectStore("settings",{keyPath:"key"});
        if(!db.objectStoreNames.contains("meta"))db.createObjectStore("meta",{keyPath:"key"});
      };
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  function storeRequest(storeName,mode,operation){
    return new Promise((resolve,reject)=>{
      const tx=state.db.transaction(storeName,mode);let result;
      try{result=operation(tx.objectStore(storeName));}catch(e){reject(e);return;}
      tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error||new Error("Could not save local progress"));tx.onabort=()=>reject(tx.error||new Error("Local save was cancelled"));
      if(result){result.onsuccess=()=>{};result.onerror=()=>reject(result.error);}
    });
  }
  const getAll = name => request(state.db.transaction(name,"readonly").objectStore(name).getAll());
  const getOne = (name,key) => request(state.db.transaction(name,"readonly").objectStore(name).get(key));
  const putOne = (name,value) => storeRequest(name,"readwrite",s=>s.put(value));
  const deleteOne = (name,key) => storeRequest(name,"readwrite",s=>s.delete(key));
  function bulkPut(name,values,{clear=false}={}){
    return new Promise((resolve,reject)=>{const tx=state.db.transaction(name,"readwrite"),s=tx.objectStore(name);if(clear)s.clear();for(const v of values)s.put(v);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  }
  async function setting(key,fallback=null){const found=await getOne("settings",key);return found?found.value:fallback;}
  async function saveSetting(key,value){await putOne("settings",{key,value});state.settings[key]=value;}

  async function loadBank(){
    const meta=await getOne("meta","bankVersion");
    if(meta?.value===BANK_VERSION){const saved=await getAll("questions");if(saved.length){state.bank=saved;return;}}
    const parts=await Promise.all(FILES.map(async path=>{const response=await fetch(path);if(!response.ok)throw new Error(`Could not load ${path}`);return response.json();}));
    const questions=parts.flat();
    await bulkPut("questions",questions,{clear:true});await putOne("meta",{key:"bankVersion",value:BANK_VERSION});state.bank=questions;
  }
  async function loadInterviewPrompts(){
    try{const response=await fetch("data/interview_prompts.json?v=20261105-interview1");if(!response.ok)throw new Error("Could not load interview prompts.");state.interviewPrompts=await response.json();}
    catch(error){console.error(error);state.interviewPrompts=[];}
  }
  async function hydrate(){
    state.attempts=await getAll("attempts");state.reviews=await getAll("reviews");state.sessions=await getAll("sessions");state.plans=await getAll("plans");
    state.settings={};for(const item of await getAll("settings"))state.settings[item.key]=item.value;
    state.bankById=new Map(state.bank.map(q=>[q.id,q]));
    state.coachMessages=state.settings.coachMessages||[];
    state.interviewRecords=state.settings.interviewRecords||[];
    state.readingRecords=state.settings.readingRecords||[];
    state.active=state.sessions.find(s=>s.status==="in-progress")||null;
    state.currentPlan=state.plans.slice().sort((a,b)=>b.createdAt-a.createdAt)[0]||null;
    if(state.active&&remainingMs(state.active)<=0)await finishSession(true);
  }
  async function init(){
    try{
      state.db=await openDatabase();await loadBank();await loadInterviewPrompts();await hydrate();
      $("#boot").hidden=true;$("#app").hidden=false;
      if(navigator.serviceWorker)navigator.serviceWorker.register("sw.js").catch(()=>{});
      render();startTimerLoop();
    }catch(error){
      $("#boot").innerHTML=`<div class="boot-mark">!</div><div><strong>Prepdesk could not open</strong><p>${esc(error.message)}. Start the local server and reload.</p></div>`;
    }
  }

  function allTopicKeys(){return [...new Set(state.bank.map(q=>`${q.category}::${q.topic}`))].sort((a,b)=>a.localeCompare(b));}
  function topicLabel(key){const [cat,topic]=key.split("::");return `${categoryText(cat)} · ${prettyTopic(topic)}`;}
  function topicStats(){
    const map=new Map();for(const a of state.attempts){const key=`${a.category}::${a.topic}`;const item=map.get(key)||{key,category:a.category,topic:a.topic,attempts:0,correct:0,wrong:0,lastAt:0};item.attempts++;if(a.correct)item.correct++;else item.wrong++;item.lastAt=Math.max(item.lastAt,a.answeredAt||0);map.set(key,item);}
    return map;
  }
  function syllabusStats(){const counts=new Map();for(const q of state.bank){const key=`${q.category}::${q.topic}`;counts.set(key,(counts.get(key)||0)+1);}return counts;}
  function accuracy(item){return item?.attempts?item.correct/item.attempts:0;}
  function progressSummary(){
    const stats=topicStats(), syllabus=syllabusStats(), all=[...syllabus].map(([key,bankCount])=>{const s=stats.get(key)||{key,category:key.split("::")[0],topic:key.split("::")[1],attempts:0,correct:0,wrong:0,lastAt:0};return {...s,bankCount,accuracy:accuracy(s)};});
    const weak=all.filter(x=>x.attempts>=3).sort((a,b)=>a.accuracy-b.accuracy||b.wrong-a.wrong);
    const notStarted=all.filter(x=>!x.attempts);
    const reviewed=state.attempts.length;const correct=state.attempts.filter(a=>a.correct).length;
    return {stats,syllabus,all,weak,notStarted,reviewed,correct,accuracy:reviewed?correct/reviewed:0};
  }
  function dueReviews(){const now=Date.now();return state.reviews.filter(r=>(r.dueAt||0)<=now).sort((a,b)=>(a.dueAt||0)-(b.dueAt||0));}
  function dayStreak(){
    const days=new Set(state.attempts.map(a=>localDateKey(a.answeredAt)));if(!days.size)return 0;let cursor=new Date();if(!days.has(localDateKey(cursor)))cursor.setDate(cursor.getDate()-1);let n=0;while(days.has(localDateKey(cursor))){n++;cursor.setDate(cursor.getDate()-1);}return n;
  }
  function weekSummary(){const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);const key=localDateKey(d);const count=state.attempts.filter(a=>localDateKey(a.answeredAt)===key).length;days.push({label:d.toLocaleDateString(undefined,{weekday:"short"}).slice(0,2),count,today:i===0});}return days;}
  function last7Time(){const cutoff=Date.now()-7*86400000;return state.sessions.filter(s=>s.status==="completed"&&s.finishedAt>=cutoff).reduce((sum,s)=>sum+(s.elapsedSec||0),0);}
  function navButton(id,label,icon){return `<button class="nav-item ${state.page===id?"active":""}" data-nav="${id}"><span class="ico">${icon}</span><span>${label}</span></button>`;}
  function shell(content){
    const due=dueReviews().length;
    return `<div class="layout"><aside class="sidebar ${state.mobileOpen?"open":""}" id="sidebar"><div class="brand"><div class="brand-mark">P</div><div><strong>Prepdesk</strong><small>PLACEMENT PRACTICE</small></div></div><div class="nav-caption">Study desk</div><nav class="nav-list">${navButton("dashboard","Dashboard","⌂")}${navButton("sessions","Sessions","◷")}${navButton("practice","Question bank","▤")}${navButton("review","Review queue",`↻${due?`<sup>${due}</sup>`:""}`)}${navButton("planner","Month plan","▦")}${navButton("interview","Interview practice","◉")}${navButton("reading","Read & recall","▤")}${navButton("coach","Groq coach","✳")}</nav><div class="nav-spacer"></div>${navButton("settings","Settings","⚙")}<div class="sidebar-note"><span class="local-dot"></span>Your progress stays in this browser.<br>${state.bank.length.toLocaleString()} questions · IndexedDB</div></aside><div class="main-column"><header class="topbar"><div class="topbar-left"><button class="mobile-menu" data-action="mobile-menu" aria-label="Open menu">☰</button><span class="crumb">${esc(pageTitle(state.page))}</span></div><div class="top-actions"><span class="today">${new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</span><div class="avatar">${state.active?"IN":"P"}</div></div></header><main class="content">${content}</main></div></div><div id="toast-slot"></div>`;
  }
  function pageTitle(page){return ({dashboard:"Your study desk",sessions:"Practice sessions",practice:"Question bank",review:"Review queue",planner:"30-day planner",interview:"Interview practice",reading:"Read & recall",coach:"Study coach",settings:"Settings"})[page]||"Practice session";}
  function pageHead(eyebrow,title,desc,actions=""){return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div>${actions?`<div class="page-actions">${actions}</div>`:""}</div>`;}
  function kpi(label,value,foot,icon){return `<div class="card kpi"><span class="kpi-icon">${icon}</span><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-foot">${foot}</div></div>`;}

  function renderDashboard(){
    const p=progressSummary(),due=dueReviews(),reviewed=state.attempts.length,acc=Math.round(p.accuracy*100),sessionsDone=state.sessions.filter(s=>s.status==="completed");
    const totalTime=state.sessions.filter(s=>s.status==="completed").reduce((n,s)=>n+(s.elapsedSec||0),0);
    const bars=weekSummary(),max=Math.max(1,...bars.map(x=>x.count));
    const focus=[...p.weak.slice(0,4)];for(const x of p.notStarted.slice(0,Math.max(0,4-focus.length)))focus.push(x);
    const focusHtml=focus.length?focus.map(x=>{const pct=x.attempts?Math.round(x.accuracy*100):0;return `<div class="focus-row"><div class="focus-name" title="${esc(topicLabel(x.key))}">${esc(prettyTopic(x.topic))}</div><div class="bar"><span class="${x.attempts&&pct<60?"low":""}" style="width:${x.attempts?Math.max(4,pct):3}%"></span></div><div class="focus-meta">${x.attempts?`${pct}% · ${x.wrong} miss`:"Not started"}</div></div>`;}).join(""):`<div class="topic-empty">Answer a few questions and your topic focus will appear here.</div>`;
    const dueHtml=due.slice(0,4).map(r=>{const q=state.bankById.get(r.questionId);if(!q)return "";return `<div class="list-row"><span class="review-indicator"></span><div class="list-main"><strong>${esc(q.question)}</strong><small>${esc(categoryText(q.category))} · ${esc(prettyTopic(q.topic))} · ${r.lapses||0} misses</small></div><span class="tag orange">Due</span></div>`;}).join("");
    const activeCTA=state.active?`<button class="btn large" data-action="continue-session">Continue session</button>`:`<button class="btn large" data-nav="sessions">Start a 20-minute session</button>`;
    const planCTA=state.currentPlan?`<button class="btn secondary" data-nav="planner">Open my month plan</button>`:`<button class="btn secondary" data-nav="planner">Build a month plan</button>`;
    return `${pageHead("WELCOME BACK","Make steady progress.","A little focused practice adds up. Pick up where you left off or start fresh.",`<button class="btn secondary" data-nav="settings">⚙ Settings</button>`)}
      <section class="card hero"><div class="hero-copy"><div class="eyebrow">YOUR NEXT GOOD SESSION</div><h2>${state.active?"Your session is waiting.":"Build your placement confidence."}</h2><p>${due.length?`${due.length} missed question${due.length===1?"":"s"} ready to revisit, plus a question bank that spans the full aptitude syllabus.`:"Choose a quick warm-up, a balanced session, or a full deep-practice block."}</p><div class="hero-actions">${activeCTA}${planCTA}</div></div><div class="hero-art"></div><div class="hero-stat"><b>${dayStreak()} day${dayStreak()===1?"":"s"}</b><span>practice streak</span></div></section>
      <div class="grid kpis" style="margin-top:18px">${kpi("Questions answered",reviewed.toLocaleString(),`${sessionsDone.length} completed sessions`,"✓")}${kpi("Accuracy",`${acc}%`,reviewed?`${p.correct} correct so far`:"Your first result starts your baseline","◎")}${kpi("Study time",fmtDuration(totalTime),`${fmtDuration(last7Time())} in the last 7 days`,"◷")}${kpi("Due to review",due.length,due.length?"Missed questions return in upcoming sessions":"Nothing is waiting right now","↻")}</div>
      <div class="grid two"><section><div class="section-title"><div><h2>Practice this week</h2><p>Questions answered each day</p></div><span class="tag">7 days</span></div><div class="card card-pad"><div class="week-chart">${bars.map(d=>`<div class="day-col"><span class="day-val">${d.count||""}</span><div class="day-bar ${d.today?"today-bar":""}" style="height:${Math.max(3,d.count/max*108)}px"></div><span class="day-lbl">${d.label}</span></div>`).join("")}</div></div>
      <div class="section-title"><div><h2>Good next topics</h2><p>Based on misses and topics you have not tried</p></div><button class="text-link" data-nav="coach">Ask Groq coach ↗</button></div><div class="card card-pad"><div class="focus-list">${focusHtml}</div></div></section>
      <section><div class="section-title"><div><h2>Ready to revisit</h2><p>Incorrect answers are scheduled to come back</p></div><button class="text-link" data-nav="review">See queue ↗</button></div><div class="review-list">${dueHtml||`<div class="card empty-state"><b>All caught up</b>Your next missed answer will be saved here for review.</div>`}</div><div class="section-title"><div><h2>Recent sessions</h2><p>Your latest practice blocks</p></div><button class="text-link" data-nav="sessions">Start a session ↗</button></div><div class="history-list">${renderRecentSessions(3)||`<div class="card empty-state"><b>No sessions yet</b>Start with a 20-minute warm-up and build from there.</div>`}</div></section></div>`;
  }
  function renderRecentSessions(limit=6){return state.sessions.filter(s=>s.status==="completed").sort((a,b)=>(b.finishedAt||0)-(a.finishedAt||0)).slice(0,limit).map(s=>{const pct=s.answered?Math.round(s.correct/s.answered*100):0;return `<div class="list-row"><span class="tag green">${pct}%</span><div class="list-main"><strong>${esc(s.title||"Practice session")}</strong><small>${fmtLong(s.finishedAt||s.startedAt)} · ${s.correct||0}/${s.answered||0} correct</small></div><span class="list-end">${fmtDuration(s.elapsedSec)}</span></div>`;}).join("");}

  const COMBOS=[
    {id:"balanced",title:"All subjects",small:"Balanced placement practice",categories:CATEGORIES,topics:[]},
    {id:"quant",title:"Quant focus",small:"Core numerical aptitude",categories:["quant"],topics:[]},
    {id:"di",title:"Data interpretation",small:"Charts, tables & calculations",categories:["quant"],topics:["quant::data-interpretation"]},
    {id:"reasoning",title:"Reasoning & patterns",small:"Logic, sequences & figures",categories:["reasoning"],topics:[]},
    {id:"verbal",title:"Verbal practice",small:"Language & comprehension",categories:["verbal"],topics:[]},
    {id:"review",title:"Due answers",small:"Revisit previous misses",categories:CATEGORIES,topics:[],reviewOnly:true}
  ];
  function renderSessionSetup(){
    const combo=COMBOS.find(x=>x.id===state.selectedCombo)||COMBOS[0];
    const topicOptions=allTopicKeys().map(k=>`<option value="${esc(k)}" ${combo.topics.includes(k)?"selected":""}>${esc(topicLabel(k))}</option>`).join("");
    return `${pageHead("MAKE IT YOURS","Set up a practice session.","Pick a time window, subjects, and focus. Missed answers are brought forward automatically.")}
      <div class="grid two"><section class="card card-pad"><div class="section-title" style="margin:0 0 12px"><div><h2>Choose a session length</h2><p>A question target keeps practice moving</p></div></div><div class="session-presets">${[[20,"Quick reps","15 questions · a focused warm-up"],[45,"Standard session","35 questions · a balanced practice block"],[120,"Deep practice","90 questions · extended exam prep"]].map(([n,t,d])=>`<button class="preset ${state.selectedDuration===n?"selected":""}" data-duration="${n}"><span class="preset-time">${n} min</span><span class="preset-title">${t}</span><span class="preset-info">${d}</span></button>`).join("")}</div><div class="divider"></div><div class="form-stack"><div><div class="label" style="margin-bottom:8px">Ready-made combinations</div><div class="combo-grid">${COMBOS.map(c=>`<button class="combo-btn ${state.selectedCombo===c.id?"active":""}" data-combo="${c.id}"><b>${c.title}</b><small>${c.small}</small></button>`).join("")}</div></div><div><div class="label" style="margin-bottom:8px">Choose subjects</div><div class="choice-grid">${CATEGORIES.map(c=>`<label class="chip-check"><input type="checkbox" name="session-category" value="${c}" ${combo.categories.includes(c)?"checked":""}><span>${categoryText(c)}</span></label>`).join("")}</div></div><div class="field"><label for="session-topics">Optional topic focus <span class="subtle-line">(leave empty to mix all topics in the selected subjects)</span></label><select id="session-topics" multiple>${topicOptions}</select><span class="field-help">Tip: hold Ctrl while selecting more than one topic on Windows.</span></div><div class="toggle-row"><div class="toggle-label"><strong>Bring due answers forward</strong><small>Questions you missed will appear near the start</small></div><label class="switch"><input id="session-review-first" type="checkbox" checked><span></span></label></div><button class="btn large" data-action="start-session">Start my ${state.selectedDuration}-minute session →</button></div></section>
      <aside class="form-stack"><div class="card card-pad"><div class="eyebrow">SESSION FLOW</div><h2 style="font:800 19px Manrope,sans-serif;margin:0">Focused, one question at a time.</h2><div class="insight-list"><div class="insight"><b>Answer at your own pace</b><span>You can skip, return, pause, or finish early.</span></div><div class="insight"><b>Learn from each miss</b><span>The explanation appears after you answer. Missed questions join your next review queue.</span></div><div class="insight"><b>Everything saves as you go</b><span>If you close the tab, your active session can be continued later.</span></div></div></div><div class="card card-pad"><div class="eyebrow">YOUR BANK</div><div style="font:800 26px Manrope,sans-serif">${state.bank.length.toLocaleString()}</div><div class="subtle-line">questions · ${allTopicKeys().length} topic areas · three subjects</div></div></aside></div>`;
  }
  function applyCombo(id){
    const c=COMBOS.find(x=>x.id===id)||COMBOS[0];state.selectedCombo=id;
    document.querySelectorAll('input[name="session-category"]').forEach(x=>x.checked=c.categories.includes(x.value));
    const topicSelect=$("#session-topics");if(topicSelect){for(const o of topicSelect.options)o.selected=c.topics.includes(o.value);}
    const reviewToggle=$("#session-review-first");if(reviewToggle)reviewToggle.checked=true;
    document.querySelectorAll(".combo-btn").forEach(b=>b.classList.toggle("active",b.dataset.combo===id));
  }
  function renderQuestion(q,answerState){
    if(!q)return `<div class="card empty-state"><b>Question not found</b>This item is no longer in the saved bank.</div>`;
    const images=(q.images||[]).map((src,i)=>`<img src="${esc(src)}" alt="Question figure ${i+1}" loading="lazy">`).join("");
    const options=(q.options||[]).map((o,i)=>{let cls="option";if(answerState){if(i===q.answer)cls+=" correct";else if(i===answerState.choice)cls+=" incorrect";}return `<label class="${cls}"><input type="radio" name="answer-choice" value="${i}" ${answerState?(answerState.choice===i?"checked":"disabled"):""}><span>${esc(o)}</span></label>`;}).join("");
    const feedback=answerState?`<div class="feedback ${answerState.correct?"good":"bad"}"><strong>${answerState.correct?"Correct":"Not quite"} · Answer: ${esc(q.options[q.answer])}</strong>${q.explanation?`<div class="explanation">${esc(q.explanation)}</div>`:""}<div class="subtle-line" style="margin-top:7px">${answerState.correct?"Nice work. This question is scheduled for spaced review.":"We’ll bring this one back in an upcoming session."}</div>${q.url?`<a class="source-link" href="${esc(q.url)}" target="_blank" rel="noreferrer">Open source ↗</a>`:""}</div>`:"";
    return `<section class="card question-card"><div class="question-top"><div class="shortcuts"><span class="tag">${esc(categoryText(q.category))}</span><span class="tag gray">${esc(prettyTopic(q.topic))}</span></div><span class="origin">${esc(q.source||"")}</span></div><div class="question-content">${q.passage?`<div class="passage">${renderPassage(q.passage)}</div>`:""}<p class="question-text">${esc(q.question)}</p>${images?`<div class="figures">${images}</div>`:""}<form id="answer-form"><div class="options">${options}</div>${answerState?"":`<div class="answer-cta"><button class="btn" type="submit">Check answer</button><span class="kbd-hint">Your progress saves automatically</span></div>`}</form>${feedback}</div></section>`;
  }
  function renderPassage(text){
    const blocks=String(text||"").trim().split(/\n\s*\n/);
    return blocks.map(block=>{const lines=block.split("\n").filter(x=>x.trim().startsWith("|"));if(lines.length>=2){const rows=lines.map(line=>line.trim().replace(/^\||\|$/g,"").split("|").map(c=>c.trim())).filter(row=>!row.every(c=>/^:?-{3,}:?$/.test(c)));if(rows.length){return `<table><thead><tr>${rows[0].map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(row=>`<tr>${row.map(c=>`<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;}}return `<p>${esc(block).replace(/\n/g,"<br>")}</p>`;}).join("");
  }
  function remainingMs(session){if(session.isPaused)return session.pausedRemaining||0;return Math.max(0,(session.endsAt||0)-Date.now());}
  function timerText(ms){const sec=Math.ceil(ms/1000),m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;}
  function renderActiveSession(){
    const s=state.active;if(!s)return `${pageHead("PRACTICE","No session is in progress.","Set up a focused block and get started.",`<button class="btn" data-nav="sessions">Set up a session →</button>`)}`;return `<div class="session-head"><button class="btn secondary small" data-nav="dashboard">← Desk</button><div class="session-progress"><span style="width:${Math.round((s.index+1)/s.questionIds.length*100)}%"></span></div><div class="session-meta"><span>${s.index+1} / ${s.questionIds.length}</span><strong class="session-timer ${remainingMs(s)<60000?"urgent":""}" id="live-timer">${timerText(remainingMs(s))}</strong></div></div><div class="section-title" style="margin-top:3px"><div><span class="tag">${s.durationMin} minute session</span> ${s.isPaused?`<span class="tag orange">Paused</span>`:""}</div><div class="subtle-line">${s.answers.filter(a=>a.correct).length} correct · ${s.answers.filter(a=>!a.correct).length} missed</div></div>${renderQuestion(state.bankById.get(s.questionIds[s.index]),s.answers.find(a=>a.questionId===s.questionIds[s.index]))}<div class="session-bottom"><span class="kbd-hint">You can move on and return to an unanswered question.</span><div class="session-buttons"><button class="btn secondary small" data-action="previous-question" ${s.index===0?"disabled":""}>← Previous</button><button class="btn secondary small" data-action="pause-session">${s.isPaused?"Resume timer":"Pause timer"}</button><button class="btn danger small" data-action="finish-session">Finish session</button><button class="btn small" data-action="next-question">${s.index===s.questionIds.length-1?"Finish →":"Next question →"}</button></div></div>`;
  }
  function renderResult(){
    const s=state.lastResult;
    if(!s)return `${pageHead("SESSION COMPLETE","Nice work showing up.","Your results and review schedule have been saved.",`<button class="btn" data-nav="sessions">Start another</button>`)}`;
    const pct=s.answered?Math.round(s.correct/s.answered*100):0;
    return `${pageHead("SESSION COMPLETE","You put in the work.","Your results are saved and missed answers will return in upcoming sessions.",`<button class="btn" data-nav="sessions">Plan another session →</button>`)}<div class="result-hero"><div><div class="eyebrow">SESSION SCORE</div><div class="result-score">${s.correct}<span style="font-size:20px;color:#668078"> / ${s.answered}</span></div><div class="result-details">${pct}% correct · ${fmtDuration(s.elapsedSec)} studied · ${s.durationMin}-minute block</div></div><div class="result-ring" style="--pct:${pct}%" data-label="${pct}%"></div></div><div class="grid three" style="margin-top:15px">${kpi("Correct",s.correct,"Keep building accuracy","✓")}${kpi("Need another look",s.answered-s.correct,"Added to your review system","↻")}${kpi("Time focused",fmtDuration(s.elapsedSec),"Saved in your study history","◷")}</div><div class="section-title"><div><h2>What to carry into the next session</h2><p>Review those misses while the method is still fresh</p></div><button class="btn secondary small" data-nav="review">Open review queue</button></div><div class="card card-pad">${(s.answers||[]).filter(a=>!a.correct).slice(0,5).map(a=>{const q=state.bankById.get(a.questionId);return q?`<div class="list-row"><span class="tag red">Review</span><div class="list-main"><strong>${esc(q.question)}</strong><small>${esc(prettyTopic(q.topic))} · Your answer: ${esc(q.options[a.choice])} · Correct: ${esc(q.options[q.answer])}</small></div></div>`:"";}).join("")||`<div class="empty-state"><b>Clean session</b>No misses this time. Keep rotating through the syllabus.</div>`}</div>`;
  }
  function renderSessionPage(){if(state.page==="session")return state.lastResult&&!state.active?renderResult():state.active?renderActiveSession():renderSessionSetup();return renderSessionSetup();}

  function renderReview(){
    const due=dueReviews(),upcoming=state.reviews.filter(r=>r.dueAt>Date.now()).sort((a,b)=>a.dueAt-b.dueAt).slice(0,20);
    const card=(r,isDue)=>{const q=state.bankById.get(r.questionId);if(!q)return "";const last=state.attempts.filter(a=>a.questionId===q.id).sort((a,b)=>b.answeredAt-a.answeredAt)[0];return `<div class="list-row"><span class="review-indicator" style="background:${isDue?"#d99b64":"#83aaa0"}"></span><div class="list-main"><strong>${esc(q.question)}</strong><small>${esc(categoryText(q.category))} · ${esc(prettyTopic(q.topic))} · ${r.lapses||0} miss${r.lapses===1?"":"es"}${last?` · Last answer ${fmtDate(last.answeredAt)}`:""}</small></div><div class="list-end">${isDue?`<span class="tag orange">Due now</span>`:`${fmtDate(r.dueAt)}`}</div></div>`;};
    return `${pageHead("SPACED REVIEW","Turn misses into progress.","Wrong answers come back first in your next sessions. Correct reviews are spaced farther apart.",`<button class="btn" data-action="review-session" ${due.length?"":"disabled"}>Practice ${due.length} due →</button>`)}<div class="grid kpis">${kpi("Due now",due.length,"Missed questions and scheduled reviews","↻")}${kpi("In review cycle",state.reviews.length,"Questions currently on a spaced schedule","▤")}${kpi("Revisited",state.attempts.filter(a=>a.isReview).length,"Review attempts recorded","✓")}${kpi("Next due",upcoming[0]?fmtDate(upcoming[0].dueAt):"—",upcoming.length?"Upcoming spaced review":"No future reviews queued","◷")}</div><div class="grid two"><section><div class="section-title" style="margin-top:0"><div><h2>Due to practice</h2><p>These questions are prioritized in new sessions</p></div></div><div class="review-list">${due.slice(0,100).map(r=>card(r,true)).join("")||`<div class="card empty-state"><b>Nothing due right now</b>When you miss an answer, it will be added here and returned in the next session.</div>`}</div></section><aside><div class="card card-pad"><div class="eyebrow">HOW REVIEW WORKS</div><h2 style="font:800 18px Manrope,sans-serif;margin:0">A little, again, later.</h2><p class="subtle-line">A wrong answer is marked due immediately and is placed near the start of your next session. When you get it right, the next review moves out to 1, 3, 7, 14, then 30 days.</p><div class="divider"></div><div class="section-title" style="margin:0 0 9px"><div><h2>Coming up</h2></div></div><div class="review-list">${upcoming.map(r=>card(r,false)).join("")||`<div class="subtle-line">No spaced reviews are scheduled yet.</div>`}</div></div></aside></div>`;
  }

  function renderPractice(){
    const topics=allTopicKeys();
    return `${pageHead("QUESTION BANK","Pick a topic and practise it.","Browse the saved syllabus or make a targeted practice session.",`<button class="btn" data-nav="sessions">Build a session →</button>`)}<div class="grid two"><section class="card card-pad"><div class="form-stack"><div class="field"><label for="bank-category">Subject</label><select id="bank-category"><option value="all">All subjects</option>${CATEGORIES.map(c=>`<option value="${c}">${categoryText(c)}</option>`).join("")}</select></div><div class="field"><label for="bank-topic">Topic</label><select id="bank-topic">${topics.map(k=>`<option value="${esc(k)}">${esc(topicLabel(k))} · ${syllabusStats().get(k)}</option>`).join("")}</select></div><button class="btn" data-action="practice-topic">Start this topic →</button><button class="btn secondary" data-action="browse-filter">Show topics for selected subject</button></div></section><aside class="card card-pad"><div class="eyebrow">SYLLABUS COVERAGE</div><h2 style="font:800 19px Manrope,sans-serif;margin:0">${topics.length} topic areas</h2><p class="subtle-line">Quantitative, reasoning, and verbal records load into IndexedDB once and are available from this browser.</p><div class="divider"></div>${CATEGORIES.map(c=>`<div class="toggle-row"><div class="toggle-label"><strong>${categoryText(c)}</strong><small>${state.bank.filter(q=>q.category===c).length.toLocaleString()} questions</small></div><span class="tag">${[...new Set(state.bank.filter(q=>q.category===c).map(q=>q.topic))].length} topics</span></div>`).join("")}</aside></div><div class="section-title"><div><h2>Topic progress</h2><p>Coverage and accuracy from your attempts</p></div></div><div class="grid three">${topics.map(key=>{const stats=topicStats().get(key);const count=syllabusStats().get(key);const pct=stats?.attempts?Math.round(stats.correct/stats.attempts*100):0;return `<div class="card card-pad"><div class="tag">${esc(categoryText(key.split("::")[0]))}</div><h3 style="font:750 15px Manrope,sans-serif;margin:10px 0 2px">${esc(prettyTopic(key.split("::")[1]))}</h3><div class="subtle-line">${count} questions · ${stats?.attempts||0} tried${stats?.attempts?` · ${pct}% accuracy`:""}</div><div class="progress-track" style="margin:12px 0 11px"><span style="width:${stats?.attempts?Math.max(3,pct):0}%"></span></div><button class="text-link" data-topic-practice="${esc(key)}">Practice this topic →</button></div>`;}).join("")}</div>`;
  }

  function planItemsForMonth(){return state.currentPlan?.items||[];}
  function renderPlanner(){
    const plan=state.currentPlan,topics=allTopicKeys();
    if(!plan)return `${pageHead("PLAN MODE","Give the month a rhythm.","Build a 30-day study plan that rotates through every topic and gives extra time to your weaker areas.")}
      <div class="grid two"><section class="card card-pad"><div class="eyebrow">YOUR MONTH, PLANNED</div><h2 style="font:800 22px Manrope,sans-serif;margin:0">Let Prepdesk map the syllabus.</h2><p class="subtle-line">The planner covers all ${topics.length} topic areas, rotates Quant, Reasoning, and Verbal, and puts low-accuracy and untried areas earlier. Groq can add advice based on your progress after the plan is created.</p><div class="divider"></div><div class="form-grid"><div class="field"><label for="plan-frequency">Study days each week</label><select id="plan-frequency"><option value="4">4 days · steady</option><option value="5" selected>5 days · recommended</option><option value="6">6 days · intensive</option></select></div><div class="field"><label for="plan-duration">Session length</label><select id="plan-duration"><option value="20">20 minutes</option><option value="45" selected>45 minutes</option><option value="120">120 minutes</option></select></div></div><div class="field" style="margin-top:15px"><label for="plan-start">Start date</label><input id="plan-start" type="date" value="${localDateKey(Date.now())}"></div><div style="margin-top:18px"><button class="btn large" data-action="build-plan">Build my 30-day plan →</button></div></section><aside class="card card-pad"><div class="eyebrow">WHAT IT COVERS</div><div class="insight-list"><div class="insight"><b>Whole syllabus</b><span>Every bank topic appears in your month schedule, not only the topics you already like.</span></div><div class="insight"><b>Your weak spots</b><span>Repeated misses and low accuracy give topics more attention.</span></div><div class="insight"><b>Review days</b><span>Due questions are added to sessions to revisit what needs reinforcement.</span></div></div></aside></div>`;
    const done=plan.items.filter(x=>x.status==="completed").length,covered=new Set(plan.items.filter(x=>x.status==="completed").flatMap(x=>x.topics));
    const start=new Date(plan.startDate+"T12:00:00"),end=new Date(start);end.setDate(start.getDate()+29);const monthLabel=`${start.toLocaleDateString(undefined,{month:"short",day:"numeric"})} – ${end.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}`;
    const cells=[];const firstDay=start.getDay();for(let i=0;i<firstDay;i++)cells.push(`<div></div>`);for(let offset=0;offset<30;offset++){const date=new Date(start);date.setDate(start.getDate()+offset);const item=plan.items.find(x=>x.date===localDateKey(date));const dateLabel=date.toLocaleDateString(undefined,{month:"short",day:"numeric"});cells.push(`<div class="calendar-cell ${localDateKey(date)===localDateKey(Date.now())?"today":""}" title="${dateLabel}"><div class="calendar-num">${date.getDate()}${date.getMonth()!==start.getMonth()?` ${date.toLocaleDateString(undefined,{month:"short"})}`:""}</div>${item?`<div class="calendar-pill" title="${esc(item.title)}">${item.status==="completed"?"✓ ":""}${esc(item.title)}</div>`:""}</div>`);}
    const itemsHtml=plan.items.map((item,index)=>`<div class="plan-day"><div class="plan-date">${fmtLong(item.date)}<small>${item.status==="completed"?"Done":item.status==="in-progress"?"In progress":"Session "+(index+1)}</small></div><div><div class="plan-session-title">${esc(item.title)}</div><div class="plan-topic-list">${item.topics.map(k=>`<span class="tag gray">${esc(prettyTopic(k.split("::")[1]))}</span>`).join("")}</div><div class="plan-session-note">${item.durationMin} min · due-question review included</div></div><button class="btn small ${item.status==="completed"?"secondary":""}" data-plan-start="${esc(item.id)}" ${item.status==="completed"?"disabled":""}>${item.status==="completed"?"Completed":item.status==="in-progress"?"Continue":"Start"}</button></div>`).join("");
    return `${pageHead("30-DAY PLAN",esc(plan.title||"Your syllabus plan"),`${monthLabel} · ${plan.frequency} study days/week · ${plan.durationMin}-minute sessions`, `<button class="btn secondary" data-action="rebuild-plan">Make a new plan</button>`)}<div class="grid two"><section class="card card-pad"><div class="section-title" style="margin-top:0"><div><h2>Month view</h2><p>All planned sessions at a glance</p></div><span class="tag">${done}/${plan.items.length} done</span></div><div class="calendar-grid">${["Su","Mo","Tu","We","Th","Fr","Sa"].map(x=>`<div class="calendar-day-head">${x}</div>`).join("")}${cells.join("")}</div><div class="divider"></div><div class="label">Topic coverage from completed plan sessions</div><div class="progress-track" style="margin:10px 0 6px"><span style="width:${Math.round(covered.size/Math.max(1,topics.length)*100)}%"></span></div><div class="subtle-line">${covered.size} of ${topics.length} topics practised in this plan</div></section><aside class="card card-pad"><div class="eyebrow">COACH'S PLAN NOTE</div><h2 style="font:800 17px Manrope,sans-serif;margin:0 0 8px">${state.settings.groqApiKey?"Groq review":"Study plan ready"}</h2><p class="subtle-line">${esc(plan.coachNote||"Your schedule is based on topic coverage and the progress stored in this browser. Add a Groq key in Settings to get a personalized review of the plan.")}</p><div class="divider"></div><span class="tag">${topics.length} syllabus topics scheduled</span><span class="tag">${plan.items.length} sessions</span></aside></div><div class="section-title"><div><h2>Planned sessions</h2><p>Topics rotate across the whole syllabus</p></div></div><div class="plan-list">${itemsHtml||`<div class="empty-state">No sessions matched the selected frequency.</div>`}</div>`;
  }

  function renderCoach(){
    const msgs=state.coachMessages.length?state.coachMessages:[{role:"assistant",content:`Hi! I’m your study coach. I can look at your topic accuracy, recent misses, and review queue to help you decide what to practise next.\n\nSet your Groq API key in Settings, then ask me what’s weak or request a study plan review.`}];
    const bubbles=msgs.map(m=>`<div class="bubble ${m.role===`user`?"user":"assistant"}">${esc(m.content)}</div>`).join("");
    const p=progressSummary();const snapshot=p.weak.slice(0,5).map(x=>`<div class="insight"><b>${esc(prettyTopic(x.topic))} · ${Math.round(x.accuracy*100)}%</b><span>${x.wrong} wrong out of ${x.attempts} attempts</span></div>`).join("")||`<div class="insight"><b>Still building your baseline</b><span>Answer a few sessions and I’ll spot your strongest and weakest topics.</span></div>`;
    return `${pageHead("GROQ STUDY COACH","Get useful feedback from your work.","The coach retrieves your topic results and recent wrong answers before sending context to your selected Groq model.",`<button class="btn secondary" data-nav="settings">Set up Groq →</button>`)}<div class="coach-layout"><section class="card chat-card"><div class="chat-head"><div class="coach-orb">✳</div><div><strong>Placement study coach</strong><small>${state.settings.groqApiKey?`Connected · ${esc(state.settings.groqModel||"llama-3.3-70b-versatile")}`:"Needs a Groq API key in Settings"}</small></div></div><div class="chat-log" id="chat-log">${bubbles}</div><div class="quick-prompts"><button data-prompt="Which topics are weakest from my attempts? Give me a focused next session.">Find my weak topics</button><button data-prompt="Look at my recent wrong answers. What pattern or mistake am I repeating, and how do I fix it?">Explain my mistakes</button><button data-prompt="Review my current 30-day plan and tell me if it balances the syllabus and weak areas well.">Review my month plan</button><button data-nav="interview">Practise interview answers</button></div><form class="chat-compose" id="coach-form"><textarea id="coach-input" placeholder="Ask about your progress, a topic, or what to practise next…" rows="1"></textarea><button class="btn" type="submit" ${state.settings.groqApiKey?"":"title='Add a Groq API key in Settings first'"}>Ask</button></form></section><aside class="form-stack"><div class="card insight-card"><div class="eyebrow">LOCAL RETRIEVAL</div><h3>Progress context used</h3><p>These signals are gathered from this browser before each Groq request.</p><div class="insight-list"><div class="insight"><b>${state.attempts.length} answers</b><span>${state.sessions.filter(s=>s.status==="completed").length} completed sessions</span></div><div class="insight"><b>${dueReviews().length} reviews due</b><span>Missed questions are brought forward</span></div>${snapshot}</div></div><div class="privacy-note">Your question bank and progress stay in IndexedDB on this PC. When you ask the Groq coach, the app sends a compact progress summary and up to 8 relevant wrong answers directly to Groq using your key.</div></aside></div>`;
  }
  const INTERVIEW_METRICS=["relevance","structure","specificity","reasoning","communication","reflection"];
  const INTERVIEW_METRIC_LABEL={relevance:"Relevance",structure:"Structure",specificity:"Specificity",reasoning:"Reasoning",communication:"Communication",reflection:"Reflection"};
  const interviewCategoryLabel=value=>({all:"Any prompt",behavioral:"Behavioral",estimation:"Guesstimate",hypothetical:"What if?",personal:"Personal",ethical:"Ethics",pressure:"Pressure round"}[value]||value);
  function interviewProgressSummary(){
    const records=state.interviewRecords||[],valid=records.filter(r=>r.review?.ratings);
    const averages={};for(const metric of INTERVIEW_METRICS){const scores=valid.map(r=>Number(r.review.ratings[metric])).filter(n=>Number.isFinite(n)&&n>=1&&n<=5);averages[metric]=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10:null;}
    const weak=Object.entries(averages).filter(([,score])=>score!==null).sort((a,b)=>a[1]-b[1]).slice(0,3).map(([metric,score])=>({metric:INTERVIEW_METRIC_LABEL[metric],average:score}));
    return {reviews:valid.length,latest:valid.slice(0,5).map(r=>({date:r.createdAt,category:interviewCategoryLabel(r.category),question:r.question,overall:r.review.overallScore,ratings:r.review.ratings,nextFocus:r.review.nextFocus})),averageBySkill:averages,skillsToWorkOn:weak};
  }
  function chooseInterviewPrompt(category=state.interviewCategory){
    let pool=state.interviewPrompts.filter(p=>category==="all"||p.category===category);if(!pool.length)return null;
    const repeatable=state.interviewRecords.filter(r=>r.review&&(r.review.overallScore<3.2||INTERVIEW_METRICS.some(k=>Number(r.review.ratings?.[k])<=2))).sort((a,b)=>(a.review.overallScore||0)-(b.review.overallScore||0));
    for(const record of repeatable){const candidate=pool.find(p=>p.id===record.promptId);if(candidate)return candidate;}
    const recent=new Set(state.interviewRecords.slice(0,5).map(r=>r.promptId)),fresh=pool.filter(p=>!recent.has(p.id));return shuffle(fresh.length?fresh:pool)[0];
  }
  function discardInterviewDraftIfNeeded(){
    if(!(state.interviewDraftTranscript||state.interviewDraftFeedback))return true;
    return confirm("Discard the unsaved answer and feedback before changing prompts?");
  }
  function resetInterviewDraft(){state.interviewDraftTranscript="";state.interviewDraftFeedback="";state.interviewCopyStatus="";}
  function chatGptReviewPrompt(prompt){
    return `Act as a fair, practical placement interviewer. I will answer the interview question below aloud using voice/transcription. Listen to my complete answer, then assess only what I actually said. Be specific and constructive; do not invent details or reward confidence without evidence.\n\nQUESTION (${interviewCategoryLabel(prompt.category)}): ${prompt.question}\n\nScore each dimension from 1 to 5 (1 = weak, 3 = adequate, 5 = excellent): relevance to the question, structure (STAR for experience stories; clear steps/assumptions for estimates and scenarios), specificity/evidence, reasoning/judgment, communication/clarity, reflection/learning. Return a short overall impression, two strengths, up to three concrete improvements, and one next-practice focus. State when the transcript is incomplete or a rating is uncertain. Use this JSON shape so I can save your review:\n{"ratings":{"relevance":1,"structure":1,"specificity":1,"reasoning":1,"communication":1,"reflection":1},"overall":"one or two sentences","strengths":["..."],"improvements":["..."],"nextFocus":"...","confidence":"low, medium, or high"}`;
  }
  function renderInterview(){
    if(!state.interviewPrompt)state.interviewPrompt=chooseInterviewPrompt();
    const p=state.interviewPrompt,summary=interviewProgressSummary(),last=state.interviewRecords[0];
    const metrics=summary.skillsToWorkOn.length?summary.skillsToWorkOn.map(x=>`<span class="tag orange">${esc(x.metric)} · ${x.average}/5</span>`).join(""):`<span class="tag gray">Your skill baseline will appear after your first review</span>`;
    const history=state.interviewRecords.slice(0,12).map(r=>`<details class="interview-record"><summary><span class="interview-record-score">${Number(r.review?.overallScore||0).toFixed(1)}<small>/5</small></span><span class="interview-record-title"><strong>${esc(r.title||r.question)}</strong><small>${esc(interviewCategoryLabel(r.category))} · ${fmtLong(r.createdAt)}</small></span><span class="tag gray">Review</span></summary><div class="interview-record-body"><p>${esc(r.review?.overall||"")}</p><div class="interview-metrics">${INTERVIEW_METRICS.map(k=>`<span>${esc(INTERVIEW_METRIC_LABEL[k])} <b>${Number(r.review?.ratings?.[k]||0)}/5</b></span>`).join("")}</div>${r.review?.strengths?.length?`<p><b>Working well:</b> ${esc(r.review.strengths.join(" · "))}</p>`:""}${r.review?.improvements?.length?`<p><b>Try next:</b> ${esc(r.review.improvements.join(" · "))}</p>`:""}<p><b>Next focus:</b> ${esc(r.review?.nextFocus||"—")}</p>${r.transcript?`<details><summary>Saved answer transcript</summary><p class="interview-transcript">${esc(r.transcript)}</p></details>`:""}</div></details>`).join("");
    if(!p)return `${pageHead("SPEAKING PRACTICE","Interview prompts are unavailable.","Check that the interview prompt file is present, then reload the desk.")}`;
    return `${pageHead("SPEAKING PRACTICE","Practise answering out loud.","Pick a prompt, answer in ChatGPT voice/transcription, then bring the review back here for your selected Prepdesk model to track.",`<button class="btn secondary" data-nav="settings">Model settings →</button>`)}
      <div class="interview-layout"><section class="card interview-main"><div class="interview-toolbar"><label class="interview-filter">Prompt type<select id="interview-category">${["all","behavioral","estimation","hypothetical","personal","ethical","pressure"].map(c=>`<option value="${c}" ${state.interviewCategory===c?"selected":""}>${interviewCategoryLabel(c)}</option>`).join("")}</select></label><span class="tag">${esc(interviewCategoryLabel(p.category))}</span><span class="tag gray">${esc(p.focus)}</span></div><div class="interview-question"><div class="eyebrow">YOUR PROMPT</div><h2>${esc(p.title)}</h2><p>${esc(p.question)}</p>${p.followUps?.length?`<details class="interview-followups"><summary>Optional interviewer follow-ups</summary><ul>${p.followUps.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></details>`:""}<div class="interview-actions"><button class="btn" data-action="copy-interview-prompt">${state.interviewCopyStatus||"Copy ChatGPT voice prompt"}</button><button class="btn secondary" data-action="new-interview-prompt">New prompt</button></div><p class="interview-help">Copy the prompt, paste it into ChatGPT, switch to voice/transcription, and answer naturally. Ask ChatGPT to review your response using the rubric in the prompt.</p></div>
        <div class="interview-step"><div class="eyebrow">BRING THE REVIEW BACK</div><h3>Paste ChatGPT’s feedback</h3><p>Paste the JSON scorecard or written review. If you have the answer transcript, add it too so your selected Prepdesk model can assess the evidence directly.</p><label for="interview-transcript">Your spoken answer transcript <span class="subtle-line">optional, but improves the review</span></label><textarea id="interview-transcript" rows="5" placeholder="Paste the transcribed answer here if available…">${esc(state.interviewDraftTranscript)}</textarea><label for="interview-feedback">ChatGPT’s feedback <span class="subtle-line">required</span></label><textarea id="interview-feedback" rows="5" placeholder="Paste ChatGPT’s scorecard or feedback here…">${esc(state.interviewDraftFeedback)}</textarea><div class="interview-submit-row"><button class="btn" data-action="save-interview-review" ${state.interviewBusy||!state.settings.groqApiKey?"disabled":""}>${state.interviewBusy?"Reviewing with your model…":"Review & save with my model"}</button><span class="subtle-line">Uses ${esc(state.settings.groqModel||"llama-3.3-70b-versatile")} · saves in this browser</span></div><div class="notice warning interview-privacy">Saving sends the prompt, ChatGPT feedback, optional answer transcript, and compact aptitude/interview progress context to the Groq model configured in Settings. The saved scorecard and transcript stay in this browser.</div></div></section>
      <aside class="interview-side"><section class="card card-pad"><div class="eyebrow">YOUR INTERVIEW SKILLS</div><h3 class="interview-side-title">Progress from saved reviews</h3><div class="interview-skill-list">${metrics}</div><div class="divider"></div><div class="interview-stat-row"><span>Reviews saved</span><b>${summary.reviews}</b></div><div class="interview-stat-row"><span>Latest score</span><b>${last?`${Number(last.review?.overallScore||0).toFixed(1)}/5`:"—"}</b></div><div class="interview-stat-row"><span>Model</span><b>${state.settings.groqApiKey?esc(state.settings.groqModel||"llama-3.3-70b-versatile"):"Connect in Settings"}</b></div></section><section class="card card-pad"><div class="eyebrow">INTERVIEWER RUBRIC</div><h3 class="interview-side-title">What the score means</h3><ul class="rubric-list"><li><b>Relevance:</b> answers the actual question</li><li><b>Structure:</b> gives the listener a clear path</li><li><b>Specificity:</b> uses concrete evidence and examples</li><li><b>Reasoning:</b> makes assumptions and decisions clear</li><li><b>Communication:</b> easy to follow and concise</li><li><b>Reflection:</b> shows ownership and learning</li></ul><p class="subtle-line">Guesstimates and scenarios are judged on assumptions and reasoning; experience and personal answers are judged on evidence, ownership, and reflection.</p></section></aside></div>
      <div class="section-title"><div><h2>Your saved interview reviews</h2><p>Your lowest-rated skills guide the next repeat prompt and the study coach’s advice.</p></div>${state.interviewRecords.length?`<span class="tag">${state.interviewRecords.length} saved</span>`:""}</div><div class="interview-history">${history||`<div class="card empty-state"><b>No reviews saved yet</b>Start with any prompt above. Your answers and score trends will build up here.</div>`}</div>`;
  }
  async function copyInterviewPrompt(){
    const prompt=state.interviewPrompt;if(!prompt)return;const text=chatGptReviewPrompt(prompt);
    try{await navigator.clipboard.writeText(text);}catch{const field=document.createElement("textarea");field.value=text;field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();const copied=document.execCommand("copy");field.remove();if(!copied){toast("Could not copy automatically. Select and copy the prompt text.");return;}}
    state.interviewCopyStatus="Copied — paste into ChatGPT";render();
  }
  function extractJson(text){
    const start=text.indexOf("{");if(start<0)throw new Error("The model response did not contain a scorecard. Your pasted feedback is still here; try saving again.");
    let depth=0,inString=false,escaped=false;for(let i=start;i<text.length;i++){const ch=text[i];if(inString){if(escaped)escaped=false;else if(ch==="\\")escaped=true;else if(ch==='"')inString=false;continue;}if(ch==='"'){inString=true;continue;}if(ch==="{")depth++;else if(ch==="}"&&--depth===0)return JSON.parse(text.slice(start,i+1));}
    throw new Error("The scorecard JSON was incomplete. Your pasted feedback is still here; try again.");
  }
  async function saveInterviewReview(){
    const prompt=state.interviewPrompt,feedback=String(state.interviewDraftFeedback||"").trim(),transcript=String(state.interviewDraftTranscript||"").trim();
    if(!prompt){toast("Choose an interview prompt first.");return;}if(!feedback){toast("Paste ChatGPT’s feedback first.");return;}if(!state.settings.groqApiKey){toast("Add your Groq key in Settings to review and save this answer.");return;}
    state.interviewDraftFeedback=feedback;state.interviewDraftTranscript=transcript;state.interviewBusy=true;render();
    try{
      const request=`Normalize and independently assess this interview practice attempt using only the evidence supplied. The external feedback came from ChatGPT; treat it as an opinion to consider, not as unquestionable truth. If an answer transcript is present, use it as primary evidence. If none is present, say so in confidence and do not pretend to have heard the answer.\n\nReturn ONLY a valid JSON object with this exact schema: {"ratings":{"relevance":1,"structure":1,"specificity":1,"reasoning":1,"communication":1,"reflection":1},"overall":"brief evidence-based summary","strengths":["..."],"improvements":["..."],"nextFocus":"one practical skill to practise next","confidence":"low, medium, or high"}. Every rating must be an integer from 1 to 5. Keep lists short and actionable.\n\nPrompt type: ${interviewCategoryLabel(prompt.category)}\nPrompt: ${prompt.question}\nAnswer transcript (may be empty):\n${transcript||"[No transcript provided]"}\n\nChatGPT feedback to assess:\n${feedback}`;
      const raw=await callGroq(request,{maxTokens:1000,includeHistory:false});const parsed=extractJson(raw);const ratings={};
      for(const metric of INTERVIEW_METRICS){const value=Number(parsed.ratings?.[metric]);if(!Number.isFinite(value)||value<1||value>5)throw new Error(`The model returned an invalid ${INTERVIEW_METRIC_LABEL[metric]} score. Your pasted feedback is still here; try again.`);ratings[metric]=Math.round(value);}
      const overallScore=Math.round(INTERVIEW_METRICS.reduce((sum,k)=>sum+ratings[k],0)/INTERVIEW_METRICS.length*10)/10;
      const asList=value=>Array.isArray(value)?value.map(x=>String(x).trim()).filter(Boolean).slice(0,4):[];
      const record={id:uid(),promptId:prompt.id,title:prompt.title,category:prompt.category,question:prompt.question,transcript,chatGptFeedback:feedback,model:state.settings.groqModel||"llama-3.3-70b-versatile",createdAt:Date.now(),review:{ratings,overallScore,overall:String(parsed.overall||"Review saved."),strengths:asList(parsed.strengths),improvements:asList(parsed.improvements),nextFocus:String(parsed.nextFocus||"Practise a concise, evidence-based answer."),confidence:String(parsed.confidence||"low").toLowerCase()}};
      state.interviewRecords=[record,...state.interviewRecords].slice(0,250);await saveSetting("interviewRecords",state.interviewRecords);state.interviewPrompt=null;state.interviewDraftTranscript="";state.interviewDraftFeedback="";state.interviewCopyStatus="";toast(`Interview review saved · ${overallScore}/5`);
    }catch(error){toast(error.message||"Could not save the review. Your pasted text is still here.");}
    finally{state.interviewBusy=false;render();}
  }
  const READING_METRICS=["mainIdea","keyIdeas","accuracy","structure","ownWords","criticalThinking"];
  const READING_METRIC_LABEL={mainIdea:"Main idea",keyIdeas:"Key ideas",accuracy:"Accuracy",structure:"Structure",ownWords:"Own words",criticalThinking:"Critical thinking"};
  function readingProgressSummary(){
    const valid=(state.readingRecords||[]).filter(r=>r.review?.ratings),averages={};
    for(const metric of READING_METRICS){const scores=valid.map(r=>Number(r.review.ratings[metric])).filter(n=>Number.isFinite(n)&&n>=1&&n<=5);averages[metric]=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10:null;}
    const weak=Object.entries(averages).filter(([,score])=>score!==null).sort((a,b)=>a[1]-b[1]).slice(0,3).map(([metric,score])=>({metric:READING_METRIC_LABEL[metric],average:score}));
    return {reviews:valid.length,average:valid.length?Math.round(valid.reduce((n,r)=>n+Number(r.review.overallScore||0),0)/valid.length*10)/10:null,averageBySkill:averages,skillsToWorkOn:weak};
  }
  function safeWebUrl(value){try{const url=new URL(String(value||"").trim());return ["http:","https:"].includes(url.protocol)?url.href:"";}catch{return "";}}
  function readingVoicePrompt(title,url){
    const reference=safeWebUrl(url),link=reference?`\nReference link (use it only to check accuracy after I finish speaking, if you can access it): ${reference}`:"";
    return `I just read an article called “${title}”. I want to practise recalling and explaining what I read aloud. Do not summarize the article or reveal its ideas before I answer. Ask me to explain its central claim, the strongest supporting ideas or evidence, and one implication or question it raises. Wait until I say I am finished. Then assess only my spoken answer; use the reference link to check factual accuracy only after I finish, if accessible. Be clear if the link is unavailable or the evidence is insufficient. Give concise strengths and concrete improvements, then return one valid JSON object in this shape: {"ratings":{"mainIdea":1,"keyIdeas":1,"accuracy":1,"structure":1,"ownWords":1,"criticalThinking":1},"overall":"brief evidence-based review","strengths":["..."],"improvements":["..."],"nextFocus":"one practice goal","confidence":"low, medium, or high"}. Score every dimension from 1 to 5; do not invent what I said.${link}`;
  }
  function renderReading(){
    const summary=readingProgressSummary(),weak=summary.skillsToWorkOn.length?summary.skillsToWorkOn.map(x=>`<span class="tag orange">${esc(x.metric)} · ${x.average}/5</span>`).join(""):`<span class="tag gray">Your recall baseline appears after your first review</span>`;
    const history=state.readingRecords.slice(0,15).map(r=>`<details class="interview-record"><summary><span class="interview-record-score">${Number(r.review?.overallScore||0).toFixed(1)}<small>/5</small></span><span class="interview-record-title"><strong>${esc(r.articleTitle||"Reading recall")}</strong><small>${fmtLong(r.createdAt)} · ${esc(r.model||"Groq model")}</small></span><span class="tag gray">Review</span></summary><div class="interview-record-body"><p>${esc(r.review?.overall||"")}</p><div class="interview-metrics">${READING_METRICS.map(k=>`<span>${esc(READING_METRIC_LABEL[k])} <b>${Number(r.review?.ratings?.[k]||0)}/5</b></span>`).join("")}</div>${r.review?.strengths?.length?`<p><b>What you recalled well:</b> ${esc(r.review.strengths.join(" · "))}</p>`:""}${r.review?.improvements?.length?`<p><b>Try next:</b> ${esc(r.review.improvements.join(" · "))}</p>`:""}<p><b>Next focus:</b> ${esc(r.review?.nextFocus||"—")}</p>${safeWebUrl(r.articleUrl)?`<a class="text-link" href="${esc(safeWebUrl(r.articleUrl))}" target="_blank" rel="noopener noreferrer">Open article reference ↗</a>`:""}${r.transcript?`<details><summary>Saved spoken recall</summary><p class="interview-transcript">${esc(r.transcript)}</p></details>`:""}</div></details>`).join("");
    const board="https://aevyy.vercel.app/";
    return `${pageHead("READING PRACTICE","Read something. Then explain it from memory.","Choose any article on Aevy’s board. Read it, return here, and practise a spoken recall without copying its text.",`<a class="btn" href="${board}" target="_blank" rel="noopener noreferrer">Choose an article on Aevy ↗</a>`)}
      <div class="reading-layout"><section class="card interview-main"><div class="reading-board-callout"><div><div class="eyebrow">YOUR READING LIST</div><h2>Pick whatever interests you.</h2><p>Aevy’s curated board opens in a new tab. Prepdesk keeps only the title, link, and your practice review; it does not import article text.</p></div><a class="btn secondary" href="${board}" target="_blank" rel="noopener noreferrer">Open Aevy’s reading board ↗</a></div>
        <div class="interview-step reading-form"><div class="eyebrow">AFTER YOU READ</div><h3>Set up your recall</h3><label for="reading-title">Article title <span class="subtle-line">required</span></label><input id="reading-title" value="${esc(state.readingDraftTitle)}" placeholder="Paste or type the title you chose" maxlength="240"><label for="reading-url">Article link <span class="subtle-line">optional; helps check accuracy</span></label><input id="reading-url" inputmode="url" value="${esc(state.readingDraftUrl)}" placeholder="Paste the article’s direct link"><div class="interview-actions"><button class="btn" data-action="copy-reading-prompt">${state.readingCopyStatus||"Copy spoken-recall prompt"}</button></div><p class="interview-help">Open ChatGPT voice/transcription, paste the prompt, and explain the article without looking at it. Paste the transcript and ChatGPT’s feedback below.</p></div>
        <div class="interview-step"><div class="eyebrow">SAVE YOUR SPEAKING REVIEW</div><h3>Bring your answer back</h3><label for="reading-transcript">Your spoken recall <span class="subtle-line">optional, recommended</span></label><textarea id="reading-transcript" rows="5" placeholder="Paste the speech transcript here if available…">${esc(state.readingDraftTranscript)}</textarea><label for="reading-feedback">ChatGPT’s review <span class="subtle-line">required</span></label><textarea id="reading-feedback" rows="5" placeholder="Paste ChatGPT’s scorecard or written feedback…">${esc(state.readingDraftFeedback)}</textarea><div class="interview-submit-row"><button class="btn" data-action="save-reading-review" ${state.readingBusy||!state.settings.groqApiKey?"disabled":""}>${state.readingBusy?"Reviewing with your model…":"Review & save with my model"}</button><span class="subtle-line">Uses ${esc(state.settings.groqModel||"llama-3.3-70b-versatile")} · saves in this browser</span></div><div class="notice warning interview-privacy">Saving sends the article title and link, your pasted review, optional transcript, and compact practice progress context to the Groq model configured in Settings. Article text is not copied into Prepdesk. Saved reviews stay in this browser.</div></div>
      </section><aside class="interview-side"><section class="card card-pad"><div class="eyebrow">YOUR RECALL PRACTICE</div><h3 class="interview-side-title">Progress from saved reviews</h3><div class="interview-skill-list">${weak}</div><div class="divider"></div><div class="interview-stat-row"><span>Articles reviewed</span><b>${summary.reviews}</b></div><div class="interview-stat-row"><span>Average score</span><b>${summary.average===null?"—":`${summary.average}/5`}</b></div><div class="interview-stat-row"><span>Model</span><b>${state.settings.groqApiKey?esc(state.settings.groqModel||"llama-3.3-70b-versatile"):"Connect in Settings"}</b></div></section><section class="card card-pad"><div class="eyebrow">RECALL RUBRIC</div><h3 class="interview-side-title">What the score means</h3><ul class="rubric-list"><li><b>Main idea:</b> central argument or takeaway</li><li><b>Key ideas:</b> supporting points and examples</li><li><b>Accuracy:</b> faithful, careful recall</li><li><b>Structure:</b> a clear explanation</li><li><b>Own words:</b> explains instead of reciting</li><li><b>Critical thinking:</b> implications and questions</li></ul><p class="subtle-line">Accuracy is uncertain if neither ChatGPT nor the reviewer can access the article. The model will say when it cannot verify a detail.</p></section></aside></div>
      <div class="section-title"><div><h2>Your saved reading reviews</h2><p>Your lowest-rated recall skills stay visible for the next article.</p></div>${state.readingRecords.length?`<span class="tag">${state.readingRecords.length} saved</span>`:""}</div><div class="interview-history">${history||`<div class="card empty-state"><b>No reading reviews yet</b>Choose an article from Aevy, read it, and come back to practise recalling it aloud.</div>`}</div>`;
  }
  async function copyReadingPrompt(){
    const title=String(state.readingDraftTitle||"").trim();if(!title){toast("Enter the article title first.");$("#reading-title")?.focus();return;}
    const text=readingVoicePrompt(title,state.readingDraftUrl);
    try{await navigator.clipboard.writeText(text);}catch{const field=document.createElement("textarea");field.value=text;field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();const copied=document.execCommand("copy");field.remove();if(!copied){toast("Could not copy automatically. Select and copy the prompt text.");return;}}
    state.readingCopyStatus="Copied — paste into ChatGPT";render();
  }
  async function saveReadingReview(){
    const articleTitle=String(state.readingDraftTitle||"").trim(),articleUrl=safeWebUrl(state.readingDraftUrl),feedback=String(state.readingDraftFeedback||"").trim(),transcript=String(state.readingDraftTranscript||"").trim();
    if(!articleTitle){toast("Add the article title first.");return;}if(!feedback){toast("Paste ChatGPT’s review first.");return;}if(!state.settings.groqApiKey){toast("Add your Groq key in Settings to review and save this answer.");return;}
    state.readingDraftTitle=articleTitle;state.readingDraftUrl=articleUrl;state.readingDraftTranscript=transcript;state.readingDraftFeedback=feedback;state.readingBusy=true;render();
    try{
      const request=`Assess this spoken reading-recall practice from the evidence below. The ChatGPT review is an opinion, not unquestionable truth. Use the transcript as primary evidence of communication and recalled ideas. The article body was not imported into Prepdesk. If you cannot verify accuracy from the supplied feedback/reference, say accuracy is uncertain and lower confidence rather than inventing facts. Return ONLY valid JSON with this exact schema: {"ratings":{"mainIdea":1,"keyIdeas":1,"accuracy":1,"structure":1,"ownWords":1,"criticalThinking":1},"overall":"brief evidence-based summary","strengths":["..."],"improvements":["..."],"nextFocus":"one practical goal","confidence":"low, medium, or high"}. Every rating must be an integer from 1 to 5; keep the lists short and actionable.\n\nArticle title: ${articleTitle}\nArticle reference URL (not article text): ${articleUrl||"[Not provided]"}\nSpoken recall transcript (may be empty):\n${transcript||"[No transcript provided]"}\n\nChatGPT feedback to assess:\n${feedback}`;
      const raw=await callGroq(request,{maxTokens:1000,includeHistory:false}),parsed=extractJson(raw),ratings={};
      for(const metric of READING_METRICS){const value=Number(parsed.ratings?.[metric]);if(!Number.isFinite(value)||value<1||value>5)throw new Error(`The model returned an invalid ${READING_METRIC_LABEL[metric]} score. Your text is still here; try again.`);ratings[metric]=Math.round(value);}
      const overallScore=Math.round(READING_METRICS.reduce((sum,k)=>sum+ratings[k],0)/READING_METRICS.length*10)/10,asList=value=>Array.isArray(value)?value.map(x=>String(x).trim()).filter(Boolean).slice(0,4):[];
      const record={id:uid(),articleTitle,articleUrl,transcript,chatGptFeedback:feedback,model:state.settings.groqModel||"llama-3.3-70b-versatile",createdAt:Date.now(),review:{ratings,overallScore,overall:String(parsed.overall||"Review saved."),strengths:asList(parsed.strengths),improvements:asList(parsed.improvements),nextFocus:String(parsed.nextFocus||"Practise a clear, accurate recall in your own words."),confidence:String(parsed.confidence||"low").toLowerCase()}};
      state.readingRecords=[record,...state.readingRecords].slice(0,250);await saveSetting("readingRecords",state.readingRecords);state.readingDraftTitle="";state.readingDraftUrl="";state.readingDraftTranscript="";state.readingDraftFeedback="";state.readingCopyStatus="";toast(`Reading review saved · ${overallScore}/5`);
    }catch(error){toast(error.message||"Could not save the review. Your pasted text is still here.");}
    finally{state.readingBusy=false;render();}
  }
  function renderSettings(){
    const configured=!!state.settings.groqApiKey;
    return `${pageHead("YOUR PREFERENCES","Keep your desk comfortable.","Your question bank, answers, sessions, review schedule, and plans are stored by this browser.")}
      <div class="grid two"><section class="card card-pad"><div class="eyebrow">GROQ STUDY COACH</div><h2 style="font:800 21px Manrope,sans-serif;margin:0">Connect your Groq model.</h2><p class="subtle-line">The coach uses Groq’s chat completions endpoint. Your key is stored in this browser’s IndexedDB and sent directly from this page to Groq when you ask for advice; this project does not run an app server or database. Groq processes the coach request with your Groq account.</p><div class="settings-row"><h3>API key</h3><p>${configured?"A key is saved in this browser. Paste a replacement to change it.":"Paste your Groq API key to enable the progress coach and plan notes."}</p><div class="inline-form"><input id="groq-key" type="password" autocomplete="off" placeholder="${configured?"Saved · enter a new key to replace":"gsk_…"}" aria-label="Groq API key"><button class="btn small" data-action="save-groq">Save key</button>${configured?`<button class="btn danger small" data-action="remove-groq">Remove</button>`:""}</div><div class="subtle-line" id="groq-status" style="margin-top:7px">${configured?"Key saved locally.":"No key saved."}</div></div><div class="settings-row"><h3>Model name</h3><p>Choose an active Groq chat model. This field is editable as Groq model availability changes.</p><div class="inline-form"><input id="groq-model" type="text" value="${esc(state.settings.groqModel||"llama-3.3-70b-versatile")}" aria-label="Groq model name"><button class="btn secondary small" data-action="save-model">Save model</button><button class="btn small" data-action="test-groq" ${configured?"":"disabled"}>Test connection</button></div></div><div class="notice warning">Browser-only setup: this is convenient for a personal PC, but a key saved in a browser profile is accessible to someone who can use that profile. Don’t enter a key on a shared computer.</div></section>
      <aside class="card card-pad"><div class="eyebrow">LOCAL STUDY DATA</div><h2 style="font:800 19px Manrope,sans-serif;margin:0">Your progress belongs to this browser.</h2><p class="subtle-line">IndexedDB stores attempts, sessions, plans, and review dates automatically. Export a backup now and then if you want to carry your progress to another browser.</p><div class="settings-row"><h3>Backup progress</h3><p>Download a JSON backup of your study history. Your Groq API key is excluded.</p><button class="btn secondary small" data-action="export-backup">Download backup</button></div><div class="settings-row"><h3>Restore progress</h3><p>Restore a backup created by Prepdesk in this browser.</p><input id="backup-file" type="file" accept="application/json,.json"></div><div class="settings-row"><h3>Clear study progress</h3><p>Remove answers, reviews, sessions, chat, and plans from this browser. Your question bank stays in place.</p><button class="btn danger small" data-action="clear-progress">Clear my progress</button></div></aside></div><div class="card card-pad" style="margin-top:16px"><div class="eyebrow">APP INFORMATION</div><div class="grid three"><div><strong>${state.bank.length.toLocaleString()}</strong><div class="subtle-line">questions saved</div></div><div><strong>${allTopicKeys().length}</strong><div class="subtle-line">topic areas</div></div><div><strong>IndexedDB</strong><div class="subtle-line">browser-only progress store</div></div></div></div>`;
  }

  function render(){
    let content="";
    if(state.page==="dashboard")content=renderDashboard();
    else if(state.page==="sessions")content=renderSessionSetup();
    else if(state.page==="session")content=state.lastResult&&!state.active?renderResult():renderActiveSession();
    else if(state.page==="practice")content=renderPractice();
    else if(state.page==="review")content=renderReview();
    else if(state.page==="planner")content=renderPlanner();
    else if(state.page==="interview")content=renderInterview();
    else if(state.page==="reading")content=renderReading();
    else if(state.page==="coach")content=renderCoach();
    else if(state.page==="settings")content=renderSettings();
    $("#app").innerHTML=shell(content);$("#app").hidden=false;
    bindPageEvents();
    if(state.page==="coach")setTimeout(()=>{const log=$("#chat-log");if(log)log.scrollTop=log.scrollHeight;},0);
  }
  function bindPageEvents(){
    document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.nav)));
    document.querySelectorAll("[data-duration]").forEach(b=>b.addEventListener("click",()=>{state.selectedDuration=Number(b.dataset.duration);document.querySelectorAll("[data-duration]").forEach(x=>x.classList.toggle("selected",x===b));const start=$("[data-action='start-session']");if(start)start.textContent=`Start my ${state.selectedDuration}-minute session →`;}));
    document.querySelectorAll("[data-combo]").forEach(b=>b.addEventListener("click",()=>applyCombo(b.dataset.combo)));
    document.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>handleAction(b.dataset.action,b)));
    document.querySelectorAll("[data-topic-practice]").forEach(b=>b.addEventListener("click",()=>startSession({durationMin:45,categories:[b.dataset.topicPractice.split("::")[0]],topics:[b.dataset.topicPractice],title:`${prettyTopic(b.dataset.topicPractice.split("::")[1])} practice`,reviewFirst:true})));
    document.querySelectorAll("[data-plan-start]").forEach(b=>b.addEventListener("click",()=>startPlanItem(b.dataset.planStart)));
    const answerForm=$("#answer-form");if(answerForm)answerForm.addEventListener("submit",e=>{e.preventDefault();const picked=answerForm.querySelector('input[name="answer-choice"]:checked');if(picked)submitCurrentAnswer(Number(picked.value));});
    const coachForm=$("#coach-form");if(coachForm)coachForm.addEventListener("submit",e=>{e.preventDefault();sendCoachMessage($("#coach-input").value);});
    document.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",()=>{const input=$("#coach-input");input.value=b.dataset.prompt;input.focus();}));
    const interviewCategory=$("#interview-category");if(interviewCategory)interviewCategory.addEventListener("change",()=>{const next=interviewCategory.value;if(!discardInterviewDraftIfNeeded()){render();return;}state.interviewCategory=next;state.interviewPrompt=chooseInterviewPrompt(next);resetInterviewDraft();render();});
    const interviewTranscript=$("#interview-transcript");if(interviewTranscript)interviewTranscript.addEventListener("input",()=>{state.interviewDraftTranscript=interviewTranscript.value;});
    const interviewFeedback=$("#interview-feedback");if(interviewFeedback)interviewFeedback.addEventListener("input",()=>{state.interviewDraftFeedback=interviewFeedback.value;});
    const readingTitle=$("#reading-title");if(readingTitle)readingTitle.addEventListener("input",()=>{state.readingDraftTitle=readingTitle.value;});
    const readingUrl=$("#reading-url");if(readingUrl)readingUrl.addEventListener("input",()=>{state.readingDraftUrl=readingUrl.value;});
    const readingTranscript=$("#reading-transcript");if(readingTranscript)readingTranscript.addEventListener("input",()=>{state.readingDraftTranscript=readingTranscript.value;});
    const readingFeedback=$("#reading-feedback");if(readingFeedback)readingFeedback.addEventListener("input",()=>{state.readingDraftFeedback=readingFeedback.value;});
    document.querySelectorAll('input[name="session-category"],#session-topics').forEach(x=>x.addEventListener("change",()=>{state.selectedCombo="custom";document.querySelectorAll(".combo-btn").forEach(b=>b.classList.remove("active"));}));
    const backup=$("#backup-file");if(backup)backup.addEventListener("change",restoreBackup);
  }
  function navigate(page){state.page=page;state.mobileOpen=false;render();}

  async function handleAction(action,button){
    try{
      if(action==="mobile-menu"){state.mobileOpen=!state.mobileOpen;render();}
      else if(action==="start-session"){
        const categories=[...document.querySelectorAll('input[name="session-category"]:checked')].map(x=>x.value);
        const topics=[...($("#session-topics")?.selectedOptions||[])].map(o=>o.value);
        if(!categories.length){toast("Choose at least one subject.");return;}
        const combo=COMBOS.find(c=>c.id===state.selectedCombo);
        if(combo?.reviewOnly)await startSession({durationMin:state.selectedDuration,categories,topics,reviewOnly:true,reviewFirst:true,title:"Due answer review"});
        else await startSession({durationMin:state.selectedDuration,categories,topics,reviewFirst:$("#session-review-first")?.checked!==false,title:combo?.title||"Custom session"});
      }
      else if(action==="continue-session"){state.lastResult=null;state.page="session";render();}
      else if(action==="next-question")await nextQuestion();
      else if(action==="previous-question")await previousQuestion();
      else if(action==="finish-session") {if(confirm("Finish this session now and save the results?"))await finishSession(false);}
      else if(action==="pause-session")await togglePause();
      else if(action==="review-session")await startSession({durationMin:45,categories:CATEGORIES,reviewOnly:true,reviewFirst:true,title:"Due answer review"});
      else if(action==="practice-topic"){
        const k=$("#bank-topic")?.value;if(!k)return;await startSession({durationMin:45,categories:[k.split("::")[0]],topics:[k],title:`${prettyTopic(k.split("::")[1])} practice`,reviewFirst:true});
      }
      else if(action==="browse-filter"){
        const cat=$("#bank-category")?.value||"all",select=$("#bank-topic");const values=allTopicKeys().filter(k=>cat==="all"||k.startsWith(cat+"::"));select.innerHTML=values.map(k=>`<option value="${esc(k)}">${esc(topicLabel(k))} · ${syllabusStats().get(k)}</option>`).join("");
      }
      else if(action==="build-plan")await buildMonthPlan();
      else if(action==="rebuild-plan"){if(confirm("Replace your current month plan with a new one? Completed study history will remain.")){state.currentPlan=null;state.page="planner";render();}}
      else if(action==="save-groq")await saveGroqKey();
      else if(action==="remove-groq"){if(confirm("Remove the saved Groq API key from this browser?")){await deleteOne("settings","groqApiKey");delete state.settings.groqApiKey;render();toast("Groq key removed.");}}
      else if(action==="save-model"){const model=$("#groq-model").value.trim();if(!model){toast("Enter a Groq model name.");return;}await saveSetting("groqModel",model);toast("Model saved.");render();}
      else if(action==="test-groq")await testGroq();
      else if(action==="new-interview-prompt"){if(!discardInterviewDraftIfNeeded())return;resetInterviewDraft();state.interviewPrompt=chooseInterviewPrompt();render();}
      else if(action==="copy-interview-prompt")await copyInterviewPrompt();
      else if(action==="save-interview-review")await saveInterviewReview();
      else if(action==="copy-reading-prompt")await copyReadingPrompt();
      else if(action==="save-reading-review")await saveReadingReview();
      else if(action==="export-backup")await exportBackup();
      else if(action==="clear-progress")await clearProgress();
    }catch(error){toast(error.message||"Something went wrong.");}
  }
  async function startSession({durationMin=45,categories=CATEGORIES,topics=[],reviewOnly=false,reviewFirst=true,title="Practice session",planId=null,planItemId=null}={}){
    if(state.active){state.page="session";state.lastResult=null;render();toast("Continuing your current session.");return;}
    const topicSet=new Set(topics||[]);let pool=state.bank.filter(q=>categories.includes(q.category)&&(!topicSet.size||topicSet.has(`${q.category}::${q.topic}`)));
    if(reviewOnly){const dueIds=new Set(dueReviews().map(r=>r.questionId));pool=pool.filter(q=>dueIds.has(q.id));}
    if(!pool.length){toast(reviewOnly?"There are no due questions in that selection yet.":"No questions match that subject and topic selection.");return;}
    const dueOrder=new Map(dueReviews().map((r,i)=>[r.questionId,{...r,order:i}]));const due=reviewFirst?pool.filter(q=>dueOrder.has(q.id)).sort((a,b)=>(dueOrder.get(b.id).lapses||0)-(dueOrder.get(a.id).lapses||0)||dueOrder.get(a.id).order-dueOrder.get(b.id).order):[];const target=Math.min(pool.length,DURATION_TARGETS[durationMin]||15);const first=due.slice(0,target);const already=new Set(first.map(q=>q.id));const rest=pool.filter(q=>!already.has(q.id));const chosen=[...first,...balancedPick(rest,Math.max(0,target-first.length),topicSet.size>0)];
    if(!chosen.length){toast("No questions are available for this session.");return;}
    const now=Date.now(),id=uid();state.active={id,status:"in-progress",title,durationMin,durationSec:durationMin*60,questionIds:chosen.map(q=>q.id),index:0,answers:[],categories,topics,reviewOnly,reviewFirst,startedAt:now,endsAt:now+durationMin*60000,isPaused:false,pausedRemaining:null,planId,planItemId};
    state.sessions.push(state.active);await putOne("sessions",state.active);state.lastResult=null;state.page="session";render();
  }
  async function submitCurrentAnswer(choice){
    const s=state.active;if(!s)return;const questionId=s.questionIds[s.index];if(s.answers.some(a=>a.questionId===questionId))return;const q=state.bankById.get(questionId);if(!q)return;
    const answeredAt=Date.now(),correct=choice===q.answer,prior=state.reviews.find(r=>r.questionId===q.id);
    const attempt={id:uid(),questionId:q.id,category:q.category,topic:q.topic,choice,correct,sessionId:s.id,answeredAt,isReview:!!prior};
    const review=prior?{...prior}:{questionId:q.id,repetitions:0,lapses:0,intervalIndex:0,createdAt:answeredAt};
    review.repetitions=(review.repetitions||0)+1;review.lastAnsweredAt=answeredAt;review.lastChoice=choice;review.lastCorrect=correct;
    if(correct){review.intervalIndex=Math.min(REVIEW_DAYS.length-1,(review.intervalIndex||0)+1);review.dueAt=answeredAt+REVIEW_DAYS[review.intervalIndex]*86400000;review.lapses=review.lapses||0;}
    else{review.intervalIndex=0;review.lapses=(review.lapses||0)+1;review.dueAt=answeredAt;review.lastMissAt=answeredAt;}
    s.answers.push({questionId:q.id,choice,correct,answeredAt});
    await Promise.all([putOne("attempts",attempt),putOne("reviews",review),putOne("sessions",s)]);
    state.attempts.push(attempt);const ri=state.reviews.findIndex(r=>r.questionId===q.id);if(ri>=0)state.reviews[ri]=review;else state.reviews.push(review);
    const si=state.sessions.findIndex(x=>x.id===s.id);if(si>=0)state.sessions[si]=s;render();
  }
  async function nextQuestion(){
    if(!state.active)return;const s=state.active;
    if(s.index<s.questionIds.length-1){s.index++;await putOne("sessions",s);const i=state.sessions.findIndex(x=>x.id===s.id);if(i>=0)state.sessions[i]=s;render();}
    else await finishSession(false);
  }
  async function previousQuestion(){if(!state.active||state.active.index<=0)return;state.active.index--;await putOne("sessions",state.active);render();}
  async function togglePause(){
    if(!state.active)return;const s=state.active;
    if(s.isPaused){s.isPaused=false;s.endsAt=Date.now()+(s.pausedRemaining||0);s.pausedRemaining=null;}
    else{s.pausedRemaining=remainingMs(s);s.isPaused=true;s.endsAt=null;}
    await putOne("sessions",s);render();
  }
  async function finishSession(expired=false){
    const s=state.active;if(!s)return;const now=Date.now(),elapsed=Math.max(0,Math.min(s.durationSec,s.durationSec-Math.ceil((s.isPaused?s.pausedRemaining:Math.max(0,s.endsAt-now))/1000)));
    s.status="completed";s.finishedAt=now;s.elapsedSec=elapsed;s.answered=s.answers.length;s.correct=s.answers.filter(a=>a.correct).length;s.expired=expired;s.isPaused=false;
    await putOne("sessions",s);const i=state.sessions.findIndex(x=>x.id===s.id);if(i>=0)state.sessions[i]=s;else state.sessions.push(s);
    if(s.planId&&state.currentPlan){const item=state.currentPlan.items.find(x=>x.id===s.planItemId);if(item){item.status="completed";item.completedAt=now;}await putOne("plans",state.currentPlan);}
    state.active=null;state.lastResult=s;state.page="session";render();
  }
  function startTimerLoop(){
    clearInterval(state.timerId);state.timerId=setInterval(()=>{const s=state.active;if(!s)return;const el=$("#live-timer");const ms=remainingMs(s);if(el){el.textContent=timerText(ms);el.classList.toggle("urgent",ms<60000);}if(ms<=0&&!s.isPaused)finishSession(true);},500);
  }
  async function startPlanItem(itemId){
    const plan=state.currentPlan,item=plan?.items.find(x=>x.id===itemId);if(!item)return;if(state.active){state.page="session";render();return;}
    item.status="in-progress";await putOne("plans",plan);const cats=[...new Set(item.topics.map(k=>k.split("::")[0]))];await startSession({durationMin:item.durationMin,categories:cats,topics:item.topics,reviewFirst:true,title:item.title,planId:plan.id,planItemId:item.id});
  }

  function buildMonthItems({startDate,frequency,durationMin}){
    const p=progressSummary(),topicKeys=allTopicKeys();
    const priority=topicKeys.map(key=>{const s=p.stats.get(key);const a=s?.attempts||0,acc=accuracy(s);const priorityScore=a===0?1.25:(1-acc)*2+Math.min(1,3/a);return {key,score:priorityScore,attempts:a};}).sort((a,b)=>b.score-a.score);
    const today=new Date(startDate+"T12:00:00"),days=[];const weekdays=[1,2,3,4,5,6];const allowed=weekdays.slice(0,frequency);let cursor=0;
    for(let offset=0;offset<30;offset++){
      const date=new Date(today);date.setDate(today.getDate()+offset);if(offset===0||!allowed.includes(date.getDay()))continue;
      const itemIndex=days.length;const remaining=Math.max(1,Math.ceil((topicKeys.length-cursor)/Math.max(1,Math.round(frequency*30/7)-itemIndex)));
      const perSession=Math.max(3,Math.min(6,remaining));const chosen=[];for(let j=0;j<perSession;j++){chosen.push(priority[cursor%priority.length].key);cursor++;}
      const categoryNames=[...new Set(chosen.map(k=>categoryText(k.split("::")[0])))];
      days.push({id:uid(),date:localDateKey(date),durationMin,topics:chosen,title:`${categoryNames.join(" + ")} · ${prettyTopic(chosen[0].split("::")[1])}`,status:"planned"});
    }
    // Ensure the whole topic list is represented, even with a sparse weekly schedule.
    const covered=new Set(days.flatMap(x=>x.topics));let i=0;for(const t of topicKeys){if(covered.has(t))continue;const day=days[i%days.length];day.topics.push(t);covered.add(t);i++;}
    return days;
  }
  async function buildMonthPlan(){
    const startDate=$("#plan-start")?.value||localDateKey(Date.now()),frequency=Number($("#plan-frequency")?.value||5),durationMin=Number($("#plan-duration")?.value||45);
    const items=buildMonthItems({startDate,frequency,durationMin});if(!items.length){toast("Could not build sessions for the selected dates.");return;}
    const plan={id:uid(),title:"Your 30-day placement plan",createdAt:Date.now(),startDate,frequency,durationMin,items,coachNote:null,bankVersion:BANK_VERSION};
    state.currentPlan=plan;state.plans.push(plan);await putOne("plans",plan);state.page="planner";render();toast(`Your month plan is ready with ${items.length} sessions.`);
    if(state.settings.groqApiKey){try{const response=await callGroq(`Review this study plan. In 3-5 concise sentences, tell me if it balances the complete syllabus and my weak topics. Give one practical adjustment if needed.\nPlan summary: ${items.length} sessions over 30 days, ${frequency} days/week, ${durationMin} minutes each. Scheduled topics: ${[...new Set(items.flatMap(x=>x.topics))].join(", ")}.`,{maxTokens:500});plan.coachNote=response;await putOne("plans",plan);render();}catch(e){plan.coachNote=`Local plan created. Groq could not review it just now: ${e.message}`;await putOne("plans",plan);render();}}
  }

  function retrievalContext(query){
    const p=progressSummary(),qtext=query.toLowerCase();
    let relevant=p.all.filter(x=>x.attempts>=1&&qtext.includes(x.topic.replaceAll("-"," ")));
    if(!relevant.length){const terms=qtext.split(/[^a-z0-9]+/).filter(w=>w.length>3);relevant=p.all.filter(x=>x.attempts>=1&&terms.some(w=>x.topic.includes(w)||x.category.includes(w)));}
    if(!relevant.length)relevant=p.weak.slice(0,6);
    const relevantKeys=new Set(relevant.map(x=>x.key));
    const mistakes=state.attempts.filter(a=>!a.correct&&(!relevantKeys.size||relevantKeys.has(`${a.category}::${a.topic}`))).sort((a,b)=>b.answeredAt-a.answeredAt).slice(0,8).map(a=>{const q=state.bankById.get(a.questionId);return q?{topic:prettyTopic(q.topic),question:q.question,yourAnswer:q.options[a.choice],correctAnswer:q.options[q.answer],explanation:q.explanation||""}:null;}).filter(Boolean);
    const samples=[];for(const x of relevant.slice(0,4)){const q=state.bank.find(item=>item.category===x.category&&item.topic===x.topic);if(q)samples.push({topic:prettyTopic(x.topic),question:q.question,answer:q.options[q.answer],explanation:q.explanation||""});}
    const reading=readingProgressSummary();
    return {progress:{answers:p.reviewed,overallAccuracy:p.reviewed?Math.round(p.accuracy*100):null,completedSessions:state.sessions.filter(s=>s.status==="completed").length,dueReviews:dueReviews().length},topicResults:(relevant.length?relevant:p.all).map(x=>({subject:categoryText(x.category),topic:prettyTopic(x.topic),attempts:x.attempts,correct:x.correct,wrong:x.wrong,accuracy:x.attempts?Math.round(x.accuracy*100):null,questionsInBank:x.bankCount})),recentWrongAnswers:mistakes,questionExamples:samples,plannedMonth:state.currentPlan?{sessions:state.currentPlan.items.length,completed:state.currentPlan.items.filter(i=>i.status==="completed").length,topics:[...new Set(state.currentPlan.items.flatMap(i=>i.topics))]}:null,interviewPractice:interviewProgressSummary(),readingRecall:{reviews:reading.reviews,averageScore:reading.average,skillsToWorkOn:reading.skillsToWorkOn}};
  }
  async function callGroq(userPrompt,{maxTokens=1100,includeHistory=true}={}){
    const key=state.settings.groqApiKey,model=state.settings.groqModel||"llama-3.3-70b-versatile";if(!key)throw new Error("Add your Groq API key in Settings first.");
    const context=retrievalContext(userPrompt);
    const system=`You are a practical placement-exam study coach. You receive compact retrieved progress from the student's private local question bank. Use the attempt counts, accuracy, wrong answers, worked explanations, and syllabus coverage as evidence. Explain recurring errors without shaming. Give an actionable short recommendation and name the topics it applies to. Be honest when there are too few attempts. Never claim a topic is weak based on zero or one attempt. The user is in India; use clear student-friendly language. Do not create facts about progress that are absent from the supplied context. Progress context (JSON):\n${JSON.stringify(context)}`;
    const history=includeHistory?state.coachMessages.filter(m=>!m.pending).slice(-6).map(m=>({role:m.role,content:m.content})):[];
    if(history.length&&history[history.length-1].role==="user"&&history[history.length-1].content===userPrompt)history.pop();
    const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:system},...history,{role:"user",content:userPrompt}],temperature:0.35,max_completion_tokens:maxTokens})});
    let body={};try{body=await response.json();}catch{}
    if(!response.ok)throw new Error(body?.error?.message||`Groq returned HTTP ${response.status}. Check the saved key and model.`);
    const content=body?.choices?.[0]?.message?.content;if(!content)throw new Error("Groq returned an empty response.");return content;
  }
  async function sendCoachMessage(raw){
    const text=String(raw||"").trim();if(!text)return;if(!state.settings.groqApiKey){toast("Add your Groq API key in Settings to chat with the coach.");return;}
    state.coachMessages.push({role:"user",content:text,at:Date.now()});await saveSetting("coachMessages",state.coachMessages);render();
    state.coachMessages.push({role:"assistant",content:"Thinking through your progress…",pending:true,at:Date.now()});render();
    try{const answer=await callGroq(text);state.coachMessages.pop();state.coachMessages.push({role:"assistant",content:answer,at:Date.now()});}
    catch(error){state.coachMessages.pop();state.coachMessages.push({role:"assistant",content:`I couldn’t reach Groq: ${error.message}\n\nYour local progress is still saved. You can check the key and model in Settings and try again.`,at:Date.now()});}
    await saveSetting("coachMessages",state.coachMessages);render();
  }
  async function saveGroqKey(){const key=$("#groq-key")?.value.trim();if(!key){toast("Paste a Groq API key first.");return;}await saveSetting("groqApiKey",key);toast("Groq key saved in this browser.");render();}
  async function testGroq(){
    const key=state.settings.groqApiKey;if(!key)return;const model=$("#groq-model")?.value.trim()||state.settings.groqModel||"llama-3.3-70b-versatile";const status=$("#groq-status");if(status)status.textContent="Checking the connection…";
    try{const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"user",content:"Reply with the single word Connected."}],max_completion_tokens:16,temperature:0})});let body={};try{body=await response.json();}catch{}if(!response.ok)throw new Error(body?.error?.message||`HTTP ${response.status}`);toast(`Groq is connected (${model}).`);if(status)status.textContent=`Connected · ${model}`;}
    catch(e){if(status)status.textContent=`Connection failed: ${e.message}`;toast(`Could not connect to Groq: ${e.message}`);}
  }

  async function exportBackup(){
    const [attempts,reviews,sessions,plans]=await Promise.all([getAll("attempts"),getAll("reviews"),getAll("sessions"),getAll("plans")]);
    const backup={app:"Prepdesk",version:2,exportedAt:new Date().toISOString(),bankVersion:BANK_VERSION,attempts,reviews,sessions,plans,interviewRecords:state.interviewRecords,readingRecords:state.readingRecords};
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`prepdesk-progress-${localDateKey(Date.now())}.json`;a.click();URL.revokeObjectURL(url);toast("Progress backup downloaded. The Groq key is not included.");
  }
  async function restoreBackup(event){
    const file=event.target.files?.[0];if(!file)return;try{const backup=JSON.parse(await file.text());if(backup.app!=="Prepdesk"||!Array.isArray(backup.attempts))throw new Error("That file is not a Prepdesk progress backup.");if(!confirm(`Restore ${backup.attempts.length} answers, ${backup.sessions?.length||0} sessions, ${backup.plans?.length||0} plans, ${backup.interviewRecords?.length||0} interview reviews, and ${backup.readingRecords?.length||0} reading reviews? Existing records with the same ID will be replaced.`))return;
      await Promise.all([bulkPut("attempts",backup.attempts),bulkPut("reviews",backup.reviews||[]),bulkPut("sessions",backup.sessions||[]),bulkPut("plans",backup.plans||[])]);if(Array.isArray(backup.interviewRecords))await saveSetting("interviewRecords",backup.interviewRecords);if(Array.isArray(backup.readingRecords))await saveSetting("readingRecords",backup.readingRecords);await hydrate();toast("Progress restored.");render();
    }catch(e){toast(e.message);}finally{event.target.value="";}
  }
  async function clearProgress(){
    if(!confirm("Clear all answers, review schedules, sessions, plans, interview practice, reading recall, and coach chat from this browser? The question bank and Groq key will remain."))return;
    for(const name of ["attempts","reviews","sessions","plans"])await storeRequest(name,"readwrite",s=>s.clear());await deleteOne("settings","coachMessages");await deleteOne("settings","interviewRecords");await deleteOne("settings","readingRecords");state.attempts=[];state.reviews=[];state.sessions=[];state.plans=[];state.interviewRecords=[];state.readingRecords=[];state.coachMessages=[];state.active=null;state.currentPlan=null;state.lastResult=null;state.page="dashboard";render();toast("Study progress cleared.");
  }
  function toast(message){const slot=$("#toast-slot");if(!slot)return;slot.innerHTML=`<div class="toast" role="status">${esc(message)}</div>`;setTimeout(()=>{if(slot)slot.innerHTML="";},3600);}

  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&state.mobileOpen){state.mobileOpen=false;render();}if(state.page==="session"&&state.active&&e.key==="ArrowRight"&&!$("#answer-form"))nextQuestion();});
  init();
})();
