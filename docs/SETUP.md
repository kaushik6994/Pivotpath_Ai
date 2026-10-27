# Run Atlas on your computer

You only need Python and a browser to run the app. VS Code is optional: it is an editor that makes the project easier to inspect and change.

## 1. Install Python

Download Python **3.11 or newer** from [python.org](https://www.python.org/downloads/).

- **Windows:** select **Add Python to PATH** in the installer. After installation, close and reopen any terminal windows.
- **macOS:** use the installer from python.org. The command is usually `python3`.
- **Linux:** install Python and its virtual-environment package through your distribution. Ubuntu/Debian commonly use `sudo apt install python3 python3-venv`.

To check the installation, open Command Prompt, PowerShell, or Terminal and run:

```text
python --version
```

On macOS/Linux, try `python3 --version`; on Windows, try `py -3 --version`. A result such as `Python 3.12.7` means Python is available. You do not need to install Node.js or SQLite separately.

## 2. Get the project

Open the [Atlas implementation branch](https://github.com/kaushik6994/Pivotpath_Ai/tree/codex/atlas-document-workspace), select **Code → Download ZIP**, and extract it. Until the pull request is merged, the app is on this branch rather than `main`. Open the extracted folder containing `README.md`, `requirements.txt`, `backend`, and `web`.

If you already use Git:

```bash
git clone --branch codex/atlas-document-workspace https://github.com/kaushik6994/Pivotpath_Ai.git
cd Pivotpath_Ai
```

Choose a folder you can write to, such as Documents. Do not launch the application from inside an unextracted ZIP.

## 3. Start the easiest way

### Windows

Open the `scripts` folder and double-click `start.bat`.

### macOS or Linux

Open Terminal in the project folder, then run:

```bash
bash scripts/start.sh
```

The launcher creates a `.venv` folder, installs the packages listed in `requirements.txt`, and starts the Python server. Installation needs internet access on the first run or when dependencies change. After installation, the core app works locally without an AI API key.

The browser should open [http://127.0.0.1:8000](http://127.0.0.1:8000). If it does not, paste that address into your browser. Keep the terminal open. Press **Ctrl+C** in that terminal when you want to stop Atlas.

The next launch reuses the environment and database. Closing the browser does not erase your saved documents.

## 4. Open it in VS Code

1. Install [Visual Studio Code](https://code.visualstudio.com/).
2. Select **File → Open Folder** and choose the project folder containing `README.md`.
3. Open **Extensions** in the left sidebar. Install **Python**, published by Microsoft. Install **Python Debugger**, also published by Microsoft, if it is not installed automatically.
4. Run the launcher once to create `.venv` and install packages.
5. Press **Ctrl+Shift+P** on Windows/Linux or **Cmd+Shift+P** on macOS. Search for **Python: Select Interpreter**. Choose the interpreter in this project's `.venv` folder.
6. Stop the launcher's running server with **Ctrl+C** before starting another server.
7. Select **Run and Debug** from the sidebar, choose **Atlas: Python server**, and press **F5**. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

You can also use **Terminal → New Terminal** and run the manual commands below. You do not need to understand every source file to give the demonstration.

## Manual installation

### Windows PowerShell

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

These commands call the environment's Python directly, so PowerShell activation-policy changes are unnecessary.

### macOS/Linux

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

## Demo personas

The default local mode is a demonstration workspace. Use the profile/role selector to try **Author**, **Reviewer**, **Manager**, and **Administrator**. The examples are fictional. Demo mode deliberately permits role switching and should stay on your own computer.

The author cannot approve their own document. Switching from the document's author to the reviewer demonstrates a real server-side approval boundary.

## Start a separate workspace with real logins

This is useful for testing authentication. It does not by itself make the prototype ready for regulated use.

1. Stop the server.
2. Copy `.env.example` to `.env` in the project root.
3. Set the following values in `.env`, using your own email and a unique password of at least 12 characters:

```dotenv
ATLAS_DEMO_MODE=0
ATLAS_DATA_DIR=data-private
ATLAS_ADMIN_EMAIL=your-email@example.com
ATLAS_ADMIN_PASSWORD=your-own-long-unique-password
```

4. Start with `scripts/start.bat` or `bash scripts/start.sh`. The launcher loads `.env`.
5. Sign in as the administrator and create users from the Team area.

Use a fresh data directory. The server refuses to open a database containing demo accounts with demo mode disabled. This prevents accidentally treating the known demo accounts as real users. Keep `.env`, runtime databases, and uploads out of Git.

The launcher and VS Code debugger load `.env`. A direct `uvicorn` command does not automatically load it; set the environment variables in your terminal or use the launcher.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Python was not found | Install Python 3.11+ and enable Add Python to PATH on Windows; reopen your terminal. Try `py -3` or `python3`. |
| No module named venv / ensurepip | Install your Linux distribution's `python3-venv` package, then run the launcher again. |
| Package installation fails | Check your internet connection and your organization's package-installation policy. Keep the error text; do not disable certificate verification. |
| Address already in use / port 8000 occupied | Stop an earlier Atlas terminal, or run `python scripts/start.py --port 8001` and open the printed address. |
| Browser cannot connect | Keep the server terminal open, inspect its last error, and open the exact printed address. |
| ModuleNotFoundError in VS Code | Choose this project's `.venv` interpreter, or rerun the launcher. |
| A PDF has no usable text | It may be scanned or image-only. Run OCR using an approved tool before uploading. |
| A PDF asks for a password | Save an authorized, unencrypted copy outside Atlas before uploading. |
| Upload rejected | Use PDF, DOCX, TXT, or MD; keep files below 10 MB. Very large or malformed documents are rejected. |
| Approval blocked | Analyze the latest saved version, resolve every critical finding, meet the threshold, and use a different reviewer. |
| Non-demo startup rejects database | Set a new `ATLAS_DATA_DIR`; do not reuse the demo database. |

## Run the checks

From the project folder, with your environment's Python:

```bash
python -m pytest -q
```

Use `.venv\Scripts\python.exe` or `.venv/bin/python` in place of `python` if you have not activated the environment. The repository's GitHub Actions workflow also runs the Python checks on Python 3.11 and 3.12. Optional browser-demo logic checks run with Node.js 22+: `node --test tests/test_demo.mjs`. Node.js is not needed to run the Python application.

## Put your changes on GitHub

Install [Git](https://git-scm.com/downloads) if needed. In VS Code, open **Source Control** to inspect changed files. Keep real documents, secrets, `.env`, `.venv`, uploads, and database files out of your commit; `.gitignore` covers the standard local paths.

For an existing clone of this repository, create a new branch and push it:

```bash
git switch -c feature/atlas-workspace
git add README.md backend web docs scripts examples tests requirements.txt package.json .gitignore .env.example .vscode .github
git commit -m "Build Atlas document review workspace"
git push -u origin feature/atlas-workspace
```

Then open GitHub's **Compare & pull request** link. Review the file list before creating the pull request. If a path does not exist in your downloaded version, omit it from `git add`.

For a ZIP download without Git history, VS Code's **Source Control → Initialize Repository** and **Publish Branch** can create a repository after you sign in. Choose a private repository for internal company work. Do not force-push over an existing repository.

GitHub stores source code; it does not run the Python server automatically. A shared deployment needs a Python host, persistent storage, HTTPS, and the organization-specific controls described in [ARCHITECTURE.md](ARCHITECTURE.md).
