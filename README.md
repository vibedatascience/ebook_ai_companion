# Ebooks AI Companion

A beautiful, minimal Claude-powered assistant for chatting with PDFs, EPUBs, and webpages. Features real-time streaming responses, smart delta optimization, and a sleek edge-to-edge interface.

## ✨ Features

### 📚 Document Support
- **PDF rendering** with PDF.js - Full page-by-page rendering with text selection and clickable links
- **EPUB support** - Direct HTML rendering of EPUB chapters with preserved formatting
- **Webpage loading** - Convert any webpage to PDF for AI analysis while displaying it in an iframe
- **Plain text viewer** - Lightweight rendering for `.txt` files with adjustable zoom
- **Multi-zoom viewer** - Fit-to-page, fit-to-width, and custom zoom levels
- **Live page tracking** - Automatic page indicator updates as you scroll
- **PDF highlighting** - Select text to create highlights, save PDFs with annotations

### 🌐 Web Content (WORK IN PROGRESS)
- **URL to PDF conversion** - Load any webpage and chat about it
- **Puppeteer-powered** - Headless Chrome generates clean PDFs from webpages
- **Iframe display** - View the actual webpage while AI reads extracted text
- **Smart text extraction** - Full page text available to AI for questions
- **Works great with**: Wikipedia, articles, documentation, and most websites
- **Note**: This feature is currently under development and may have limitations

### 💬 Chat Interface
- **Streaming responses** - Real-time word-by-word text generation with blinking cursor
- **Markdown & LaTeX** - Full support for formatted text, math equations, and code blocks
- **Syntax highlighting** - Code blocks with language detection and copy buttons
- **Adjustable font size** - Built-in font size controls (10px-24px) with localStorage persistence
- **Smart auto-scroll** - Chat automatically scrolls to show latest content
- **Stop generation** - Cancel streaming responses at any time

### 🎯 Smart Features
- **Delta optimization** - 80% token cost reduction! Only sends new/changed pages, not entire document
- **Session tracking** - Remembers what context was sent per conversation
- **Context management** - Automatically builds context from pages around your current position
- **Text selection menu** - Right-click to copy, explain, or send selected text to chat
- **Clickable links** - PDF annotations and EPUB hyperlinks work for navigation (with proper scaling)
- **Internal bookmarks** - Jump to sections within documents
- **External links** - Open URLs in new tabs
- **Smart page citations** - AI references specific pages when answering

### 🎨 Interface
- **Edge-to-edge design** - Zero wasted space, maximum content area
- **Resizable panes** - Drag the divider to adjust PDF/chat layout
- **Warm color scheme** - Beautiful beige/cream aesthetic with orange accents
- **Responsive** - Adapts to different screen sizes
- **Persistent toolbar** - Zoom and navigation controls stay visible (no disappearing!)

## 📁 Project Structure

```
pdf_ai_reader/
├── index.html          # Main HTML structure with viewer and chat layout
├── app.js             # Frontend logic (PDF/EPUB rendering, streaming, UI)
├── styles.css         # Beautiful warm-themed styling
├── server.js          # Express server with Puppeteer integration
├── package.json       # Dependencies (express, cors, puppeteer)
└── node_modules/      # Installed packages
```

### Key Files
- **`index.html`** - Static shell with PDF viewer, chat sidebar, and all UI elements
- **`app.js`** - Frontend controller for document parsing, streaming chat, text selection, and navigation
- **`styles.css`** - Edge-to-edge design with warm beige/cream color scheme
- **`server.js`** - Express server with delta optimization and Puppeteer webpage conversion

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
   Choose the option that fits your deployment:

   - **Environment variable (recommended for shared servers)**
     macOS/Linux:
     ```bash
     export ANTHROPIC_API_KEY=your-key-here
     ```
     Windows PowerShell:
     ```powershell
     setx ANTHROPIC_API_KEY "your-key-here"
     ```

   - **Per-user key (ideal for GitHub Pages / personal use - RECOMMENDED)**
     Leave the server variable empty and click **Set Claude API key** in the app header.
     The key is saved locally in your browser's `localStorage` and sent only with your requests.
     A banner will remind you to set your API key, and an alert will appear if you try to chat without one.

     **Need an API key? Ask Rahul!**

   The server validates the presence of a key on every request and returns an error if none is provided.

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
- Each visitor can click **Set Claude API key** (top-right of the chat header) to store their own Anthropic key locally.
- Enable GitHub Pages (Settings → Pages → Build and deployment → GitHub Actions) to activate the workflow.

## 📖 How to Use

### Upload a Document
1. **Click "Upload"** or drag & drop a PDF/EPUB/TXT file
2. Document will render immediately in the viewer

### Load a Webpage (BETA)
1. **Enter a URL** in the "Load from Web" section
2. Server converts webpage to PDF using Puppeteer
3. View the actual webpage in iframe while AI reads extracted text
4. Works great with Wikipedia, articles, and documentation

### Navigate Documents
- Scroll through pages naturally
- Use zoom controls (+/-) or Fit Width/Fit Page buttons
- Jump to specific pages with the page input
- Click internal links and bookmarks to navigate
- PDF links scale properly with zoom level

### Ask Questions
- Type your question in the chat sidebar
- Watch the response stream in real-time with a blinking cursor
- Adjust font size with A-/A+ controls
- Click stop button to cancel generation

### Highlight Text (PDF only)
- Select text in the PDF
- Click "Highlight" button
- Click "Save" to download PDF with highlights

### Interact with Text
- Select any text in the document
- Right-click for options: Copy, Explain, or Send to chat
- Click links to navigate or open URLs

### Manage Your Session
- Click reset button to clear chat history (keeps current document)
- Click "New File" to load a different document
- Delta optimization automatically tracks conversation context

## 🔧 How It Works

### Architecture
```
Browser                    Server                      Anthropic API
┌──────────┐              ┌──────────┐               ┌──────────────┐
│ PDF.js   │──render──>   │          │               │              │
│ epub.js  │              │ Express  │◄──stream───>│ Claude API   │
│          │              │ Puppeteer│               │ (Sonnet 4.5) │
│ app.js   │─POST chat─>│ server.js│               │              │
│          │◄─SSE stream─│ Delta    │               │              │
│          │              │ optimize │               │              │
└──────────┘              └──────────┘               └──────────────┘
```

### Key Components

1. **Document Rendering**
   - PDF: `PDF.js` renders each page as canvas + text layer
   - EPUB: Direct HTML rendering with chapter-based navigation
   - Webpages: Puppeteer converts to PDF, iframe shows original
   - All text extracted and cached for AI context

2. **Delta Optimization (80% cost savings!)**
   - Tracks sent pages per conversation ID
   - First question: Sends full context
   - Follow-up (same pages): Sends NO document text
   - Navigation (new pages): Sends only new pages
   - Conversation history stripped of PDF content to avoid duplication

3. **Webpage Loading**
   - Puppeteer launches headless Chrome
   - Generates print-quality PDF from webpage
   - Frontend extracts text from PDF for AI
   - Displays original webpage in iframe
   - Negative margin CSS hides navigation headers

4. **Streaming Chat**
   - Server forwards Server-Sent Events (SSE) from Anthropic
   - Client reads stream chunk-by-chunk
   - Real-time Markdown rendering with blinking cursor
   - Syntax highlighting applied after stream completes

5. **Link Navigation**
   - PDF: Reads annotation layer, resolves internal destinations
   - Links properly scaled to match current zoom level
   - EPUB: Parses href attributes, maps to chapter indices
   - Both: Opens external URLs in new tabs

## 💰 Cost Optimization

The **delta optimization** feature dramatically reduces token usage:

- **First question**: ~150K tokens (full context)
- **Follow-up (same page)**: ~100 tokens (99.9% savings!)
- **New page navigation**: Only sends new pages
- **Total savings**: ~80% for typical multi-turn conversations

Example conversation:
1. Upload 75-page PDF → First question uses 33K tokens
2. Follow-up question → Uses only 100 tokens (same context detected)
3. Jump to page 50 → Sends only new pages since last view
4. Another follow-up → Again only 100 tokens

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| **Token limit exceeded** | Scroll to the relevant section before asking - context is built around your current page |
| **Port 3001 in use** | Kill existing process: `lsof -ti:3001 \| xargs kill -9` |
| **API errors (401/403)** | Check API key is valid and has access to Claude Sonnet 4.5 |
| **PDF won't render** | Ensure file is valid PDF and not password-protected |
| **EPUB won't load** | Verify file is valid `.epub` and not DRM-protected |
| **Webpage whitespace** | Cross-origin restrictions prevent auto-scroll, -150px margin hides headers |
| **Toolbar disappears** | Fixed with `flex-shrink: 0` and `min-height: 60px` |
| **PDF links misaligned** | Link coordinates now properly scaled with viewport zoom |
| **Streaming not working** | Check browser console and server logs for errors |

## 🔒 Security Notes

⚠️ **Important Security Considerations**:

- **Never commit real API keys** to version control
- Store keys in environment variables or `.env` (add to `.gitignore`)
- This is a **local demo project** without authentication
- **No rate limiting** - add appropriate controls for production
- **No data persistence** - all data is in-memory only
- **Intended for local use only** - do not expose to public internet without proper security
- **Puppeteer security**: Webpages run in sandbox, but be cautious loading untrusted URLs

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript (no frameworks!)
- **PDF Rendering**: PDF.js
- **EPUB Rendering**: Direct HTML (epub.js for parsing)
- **Web Conversion**: Puppeteer (headless Chrome)
- **Backend**: Node.js + Express
- **AI**: Anthropic Claude Sonnet 4.5
- **Styling**: Custom CSS with warm aesthetic
- **Markdown**: marked.js
- **LaTeX**: KaTeX
- **Code Highlighting**: Highlight.js

## 📝 License

MIT - Feel free to use this project for personal or commercial purposes!

## 🙏 Acknowledgments

- Built with Claude Code
- Powered by Anthropic's Claude API
- Delta optimization concept inspired by context caching patterns
