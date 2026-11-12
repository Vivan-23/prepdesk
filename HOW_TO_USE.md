# Prepdesk · Placement Practice

Prepdesk is a personal study website for the 1,855-question placement aptitude bank. Your question bank, answer history, session history, review schedule, plan, and coach chat are stored in IndexedDB in this browser. There is no database account or server database to set up.

## Open Prepdesk on this PC

1. Open PowerShell in this project folder.
2. Run `.\serve.ps1`.
3. Open [http://localhost:8765](http://localhost:8765) in your browser.
4. Keep the PowerShell window open while you study. Press **Ctrl+C** in that window when you are finished. The script uses Python 3 when available, with a built-in Node.js server fallback.

The local server only serves the app, question JSON, and figure files to your browser. Study progress is saved by the browser itself. The app can be installed from the browser menu as an app on this PC.

## Start practising

- Choose a 20-minute warm-up, a 45-minute session, or a 120-minute deep-practice block.
- Practise all subjects, one subject, selected topics, or a ready-made combination such as Data Interpretation or Reasoning & Patterns.
- Due questions you previously missed are placed near the start of sessions. A correct review moves the next review farther out; a wrong answer comes back in the next session.
- The month planner builds a 30-day schedule across the full question-bank syllabus. Its default is five study days per week and 45 minutes per session; both can be changed.
- The dashboard tracks questions, accuracy, study time, current review work, and topic coverage.

## Practise interview answers out loud

1. Open **Interview practice** and choose behavioral, guesstimate, what-if, personal, ethics, or pressure prompts.
2. Copy the ChatGPT voice prompt, paste it into ChatGPT, then switch to voice/transcription and answer aloud.
3. Ask ChatGPT to return the requested scorecard. Paste its review back into Prepdesk; add the answer transcript too if you want a more evidence-based assessment.
4. **Review & save with my model** sends the prompt, ChatGPT feedback, optional transcript, and compact aptitude/interview progress context to the Groq model selected in Settings. Prepdesk saves the normalized six-skill scorecard, feedback, and optional transcript in IndexedDB.

Scores cover relevance, structure, specificity, reasoning, communication, and reflection. Low-scoring prompts are prioritized for another attempt; the Groq coach can use saved score trends when it suggests what to practise. Reviews are included in the local progress backup. ChatGPT voice/transcription remains a manual handoff: Prepdesk cannot access this chat or record audio itself.

## Read an article and practise recalling it

1. Open **Read & recall**, then choose any article from the linked Aevy reading board. The board opens in a new tab; Prepdesk does not import or reproduce the articles.
2. Read the article, return to Prepdesk, and enter its title. Paste the direct article link too if you want ChatGPT to try checking details after you finish speaking.
3. Copy the spoken-recall prompt into ChatGPT voice/transcription. Explain the article from memory before asking for feedback.
4. Paste ChatGPT’s review and, if available, the speech transcript into Prepdesk. **Review & save with my model** uses the selected Groq model to assess main idea, key ideas, accuracy, structure, own-words explanation, and critical thinking.

The article title, link, review, and optional transcript are saved in IndexedDB and included in progress backups. Saving sends those details plus compact practice progress to Groq. Prepdesk never copies article text; accuracy scores stay tentative when the article cannot be checked.

## Connect the Groq study coach

1. Open **Settings** in Prepdesk.
2. Paste your Groq API key and save it.
3. Keep the default model or enter another model available to your Groq account. Use **Test connection** to check it.
4. Open **Groq coach** and ask about weak topics, recurring mistakes, or your month plan.

The coach retrieves topic results, recent wrong answers, and relevant question explanations from IndexedDB before sending a compact context directly from your browser to Groq. The API key stays in this browser’s IndexedDB and is excluded from progress backups. This is intended for your personal browser profile, not a shared computer. Groq model names and availability can change; the model field is editable.

## Progress backup and reset

In **Settings**, download a JSON backup to save your answers, reviews, sessions, plans, interview feedback, and reading recall. The backup does not include your Groq key. Restore a Prepdesk backup from the same Settings page. **Clear my progress** removes the study history but leaves the question bank in place.

## Project files

- `index.html`, `styles.css`, and `app.js` make up the website.
- `data/quant.json`, `data/reasoning.json`, and `data/verbal.json` are the source question records. The browser imports them into IndexedDB the first time it opens the current bank version.
- `data/images/` contains local question diagrams used by the website.
- `data/sources/` contains the supplied PDFs used to build the question bank.
- `data/REPORT.md` summarizes question coverage and data limitations.
