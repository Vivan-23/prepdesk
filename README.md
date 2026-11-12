# Prepdesk

Prepdesk is a browser-based placement aptitude and speaking-practice desk. It serves as a static site; IndexedDB keeps study progress in each browser, and the selected Groq model is called directly from the browser when you request coaching or an answer review.

## Run locally

Run `.\serve.ps1` in PowerShell, then open [http://localhost:8765](http://localhost:8765). The script uses Python 3 if it is installed and falls back to Node.js otherwise.

## Deploy with Netlify

The repository includes `netlify.toml` with the project root as the publish directory. Connect the repository in Netlify; no build command or server-side database is required. Each browser has its own study history and Groq key.

The deployed site is a public static website unless access controls are configured separately. The question bank and its image assets are included in the site. Keep this repository private for personal use, and do not commit source books, API keys, or private backups.

## Reading recall

**Read & recall** links to the Aevy curated reading board. Prepdesk stores the title and optional direct link you enter, plus your spoken recall and review; it does not scrape or copy article text.

See [HOW_TO_USE.md](HOW_TO_USE.md) for the full practice and backup workflow.
