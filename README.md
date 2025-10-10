# PDF.AI Reader

A beautiful, minimal Claude-powered assistant for chatting with local PDF and EPUB documents. Features real-time streaming responses, smart context management, and a sleek edge-to-edge interface inspired by pdf.ai.

## ✨ Features

### 📚 Document Support
- **PDF rendering** with PDF.js - Full page-by-page rendering with text selection
- **EPUB support** - Direct HTML rendering of EPUB chapters with preserved formatting
- **Multi-zoom viewer** - Fit-to-page, fit-to-width, and custom zoom levels
- **Live page tracking** - Automatic page indicator updates as you scroll

### 💬 Chat Interface
- **Streaming responses** - Real-time word-by-word text generation with blinking cursor
- **Markdown & LaTeX** - Full support for formatted text, math equations, and code blocks
- **Syntax highlighting** - Code blocks with language detection and copy buttons
- **Adjustable font size** - Built-in font size controls (10px-24px) with localStorage persistence
- **Smart auto-scroll** - Chat automatically scrolls to show latest content

### 🎯 Smart Features
- **Context management** - Automatically builds context from pages around your current position (~150k token limit)
- **Text selection menu** - Right-click to copy, explain, or send selected text to chat
- **Clickable links** - Both PDF annotations and EPUB hyperlinks work for navigation
- **Internal bookmarks** - Jump to sections within the document
- **External links** - Open URLs in new tabs

### 🎨 Interface
- **Edge-to-edge design** - Zero wasted space, maximum content area
- **Resizable panes** - Drag the divider to adjust PDF/chat layout
- **Warm color scheme** - Beautiful beige/cream aesthetic with orange accents
- **Responsive** - Adapts to different screen sizes

## 📁 Project Structure

```
pdf_ai_reader/
├── index.html          # Main HTML structure with viewer and chat layout
├── app.js             # Frontend logic (PDF/EPUB rendering, streaming, UI)
├── styles.css         # Beautiful warm-themed styling
├── server.js          # Express server with streaming support
├── package.json       # Dependencies (express, cors)
└── node_modules/      # Installed packages
```

### Key Files
- **`index.html`** - Static shell with PDF viewer, chat sidebar, and all UI elements
- **`app.js`** - Frontend controller for document parsing, streaming chat, text selection, and navigation
- **`styles.css`** - Edge-to-edge design with warm beige/cream color scheme
- **`server.js`** - Express server that proxies streaming requests to Anthropic API

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** (for native `fetch` support)
- **npm** package manager
- **Anthropic API key** with access to Claude Sonnet 4.5
- **Modern browser** (Chrome, Edge, Firefox, Safari)

### Installation

1. **Clone or download** the repository

2. **Install dependencies**
```bash
npm install
```

3. **Configure API key**
   Set your Anthropic API key as an environment variable before starting the server.

   macOS/Linux:
   ```bash
   export ANTHROPIC_API_KEY=your-key-here
   ```

   Windows PowerShell:
   ```powershell
   setx ANTHROPIC_API_KEY "your-key-here"
   ```

   The server validates this variable on each request and will return an error if it is missing.

4. **Start the server**
```bash
npm start
```

5. **Open in browser**
   Navigate to `http://localhost:3001`

## 🌐 GitHub Pages Frontend

- Every push to `main` runs `.github/workflows/deploy-pages.yml`, which publishes the static frontend to GitHub Pages.
- The site is static-only, so you still need to run the Express server somewhere reachable (Render, Fly.io, your own VPS, etc.).
- To point the UI at a remote backend, add a script tag _before_ `app.js` in `index.html`:
  ```html
  <script>
    window.PDF_AI_CONFIG = { API_URL: 'https://your-backend.example.com/api/chat' };
  </script>
  ```
  Omit the script for local development and the app will fall back to `http://localhost:3001/api/chat`.
- Enable GitHub Pages (Settings → Pages → Build and deployment → GitHub Actions) to activate the workflow.

## 📖 How to Use

1. **Upload a document**
   - Click "Upload" or drag & drop a PDF/EPUB file
   - Document will render immediately in the viewer

2. **Navigate the document**
   - Scroll through pages naturally
   - Use zoom controls (+/-) or Fit Width/Fit Page buttons
   - Jump to specific pages with the page input
   - Click internal links and bookmarks to navigate

3. **Ask questions**
   - Type your question in the chat sidebar
   - Watch the response stream in real-time with a blinking cursor
   - Adjust font size with A-/A+ controls

4. **Interact with text**
   - Select any text in the document
   - Right-click for options: Copy, Explain, or Send to chat
   - Click links to navigate or open URLs

5. **Manage your session**
   - Click reset button to clear chat history
   - Click "New File" to load a different document

## 🔧 How It Works

### Architecture
```
Browser                    Server                   Anthropic API
┌──────────┐              ┌──────────┐            ┌──────────────┐
│ PDF.js   │──render──>   │          │            │              │
│ epub.js  │              │ Express  │◄─stream──>│ Claude API   │
│          │              │          │            │ (Sonnet 4.5) │
│ app.js   │─POST chat─>│ server.js│            │              │
│          │◄─SSE stream─│          │            │              │
└──────────┘              └──────────┘            └──────────────┘
```

### Key Components

1. **Document Rendering**
   - PDF: `PDF.js` renders each page as canvas + text layer
   - EPUB: Direct HTML rendering with chapter-based navigation
   - All text extracted and cached for AI context

2. **Smart Context Management**
   - Expands bidirectionally from current page
   - Stops at ~150k token limit (~450k characters)
   - Includes page numbers in context for accurate citations

3. **Streaming Chat**
   - Server forwards Server-Sent Events (SSE) from Anthropic
   - Client reads stream chunk-by-chunk
   - Real-time Markdown rendering with blinking cursor
   - Syntax highlighting applied after stream completes

4. **Link Navigation**
   - PDF: Reads annotation layer, resolves internal destinations
   - EPUB: Parses href attributes, maps to chapter indices
   - Both: Opens external URLs in new tabs

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| **Token limit exceeded** | Scroll to the relevant section before asking - context is built around your current page |
| **Port 3001 in use** | Kill existing process: `lsof -ti:3001 \| xargs kill -9` |
| **API errors (401/403)** | Check API key is valid and has access to Claude Sonnet 4.5 |
| **PDF won't render** | Ensure file is valid PDF and not password-protected |
| **EPUB won't load** | Verify file is valid `.epub` and not DRM-protected |
| **Streaming not working** | Check browser console and server logs for errors |
| **Links not clickable** | Some PDFs/EPUBs may have malformed links - try re-uploading |

## 🔒 Security Notes

⚠️ **Important Security Considerations**:

- **Never commit real API keys** to version control
- Store keys in environment variables or `.env` (add to `.gitignore`)
- This is a **local demo project** without authentication
- **No rate limiting** - add appropriate controls for production
- **No data persistence** - all data is in-memory only
- **Intended for local use only** - do not expose to public internet without proper security

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript (no frameworks!)
- **PDF Rendering**: PDF.js
- **EPUB Rendering**: Direct HTML (epub.js for parsing)
- **Backend**: Node.js + Express
- **AI**: Anthropic Claude Sonnet 4.5
- **Styling**: Custom CSS with warm aesthetic
- **Markdown**: marked.js
- **LaTeX**: KaTeX
- **Code Highlighting**: Highlight.js

## 📝 License

MIT - Feel free to use this project for personal or commercial purposes!

## 🙏 Acknowledgments

- Inspired by [pdf.ai](https://pdf.ai)
- Built with Claude Code
- Powered by Anthropic's Claude API
