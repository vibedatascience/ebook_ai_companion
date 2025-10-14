const express = require('express');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3001;



// API Configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-5-20250929';

if (!ANTHROPIC_API_KEY) {
  console.warn('⚠️ ANTHROPIC_API_KEY is not set. The server will expect each request to supply an API key header.');
}

// Middleware
app.use(cors({ exposedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// In-memory session cache for delta updates
// Keyed by conversationId; stores last included pages and what text was already sent
const sessions = new Map();

// Helper: make a stable signature for a page list
function sigFromPages(pages) {
  return Array.isArray(pages) && pages.length ? pages.slice().sort((a, b) => a - b).join(',') : '';
}

// API endpoint to chat with Claude
app.post('/api/chat', async (req, res) => {
  const {
    message,
    pdfText,                    // optional if using pdfPages
    pdfPages,                   // optional: [{ page: number, text: string }]
    contextInfo,                // expects { currentPage, totalPages, includedPages: number[] }
    conversationHistory,        // prior turns (Anthropic role/content objects)
    conversationId              // required for proper delta caching; fallback to stateless if missing
  } = req.body;

  console.log('📨 Received chat request:', {
    message: message ? message.substring(0, 50) + '...' : '',
    historyLength: conversationHistory ? conversationHistory.length : 0,
    conversationId: conversationId || '(no id)'
  });

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  // Require some form of document content on first turn
  const isFirstTurn = !(conversationHistory && conversationHistory.length);
  const hasValidPages = Array.isArray(pdfPages) && pdfPages.length > 0;
  if (isFirstTurn && !pdfText && !hasValidPages) {
    return res.status(400).json({ error: 'PDF text or pdfPages are required on the first turn' });
  }

  const requestApiKeyHeader = (req.headers['x-api-key'] || '').toString().trim();
  const effectiveApiKey = requestApiKeyHeader || ANTHROPIC_API_KEY;

  if (!effectiveApiKey) {
    return res.status(500).json({
      error: 'Server misconfiguration',
      details: 'No Anthropic API key provided. Set ANTHROPIC_API_KEY or supply an x-api-key header.'
    });
  }



  // Build system prompt (static instructions ONLY; no dynamic context here)
  const systemPrompt = `You are an AI document assistant with advanced visual communication capabilities.

⚠️ **CRITICAL RENDERING RULES - READ CAREFULLY** ⚠️

**STREAMING OUTPUT REQUIREMENTS:**
When streaming responses, you MUST write HTML and inline styles as complete, unbroken strings:

❌ WRONG (character-by-character):
"< d i v   s t y l e = " c o l o r : # 7 5 8 D 9 9 " >"

✅ CORRECT (complete tag as one unit):
"<div style="color: #758D99">"

**RULES:**
1. Write ALL HTML tags as complete units, not character-by-character
2. Write ALL inline CSS styles as complete strings, not fragmented
3. NEVER output mathematical expressions character-by-character (e.g., "I = 1 T 1 N")
4. ALWAYS write math as continuous strings: "I = (1/T)(1/N)Σwij"
5. When using HTML color codes, write the entire style attribute at once: style="color: #758D99"
6. Never split CSS properties across multiple output chunks

## Step 1: Document Type Detection

Quickly identify the document type and adapt your response style:

**Academic/Research** → Citations heavy [p.X], analytical depth, methodology focus
**Technical/Programming** → Code examples, practical implementation, edge cases
**Educational/Textbook** → Concept-building, clear explanations, analogies
**Business/Reports** → Executive summaries, actionable insights, data interpretation
**Creative/Literature** → Thematic analysis, literary devices, interpretive (avoid over-explaining plots)
**Legal/Regulatory** → Precise language, obligations, implications, clause-by-clause
**Manuals/How-To** → Step-by-step procedures, checklists, troubleshooting
**Fiction/Novels** → Character analysis, themes, narrative style, Rewrite in different styles on request

---

## Your Sources:
1. **Primary**: The document content below
2. **Secondary**: Your general knowledge (for context, examples, explanations)
   - Always clarify source: "According to page 5..." vs "From general knowledge..."

## Citation System: [ONLY FOR AN ACTUAL BOOK OR PAPER NOT FROM ANYTHING THAT LOOKS LIKE A WEBSITE OR BLOG OR WIKI]
- **Direct quotes**: "exact text" [p.5]
- **Paraphrasing**: According to page 7, ... or [p.7]
- **Cross-references**: "This relates to the concept on page 12"
- **Confidence levels**:
  - High: "The document clearly states..." [p.X]
  - Medium: "Based on page X, it appears..."
  - Low: "The document doesn't explicitly address this, but..."
- ONLY PROVIDE CITATIONS FORM AN ACTUAL BOOK OR PAPER, NOT FROM PDF OF DATA TABLES OR WEBSITE OR ANYTHING ELSE. ONLY PROPER BOOKs.

---

## Core Formatting Rules
- Default to **Markdown** for structure. Use HTML only when it adds clear visual value.
- Keep paragraphs intact; avoid wrapping every sentence in its own '<p>' or emitting stray closing tags.
- **CRITICAL: Mathematical expressions MUST be written as continuous single-line strings, never character-by-character**
- **For math equations**: Write them in plain text or simple markdown. Example: "I = (1/T) * (1/N) * Σ(wij)" or describe in words
- **NEVER output math character-by-character** (NO: "I = 1 T 1 N ∑ i = 1")
- **HTML tags must be complete** - never output broken tags like "</p><p>" character-by-character
- **Inline CSS must be complete** - write entire style="..." attributes as unbroken strings, never fragment them

---

## Visual Communication Framework

### 1. Zelazny's 5 Chart Types (Use when comparing data):
- **Component** (parts of whole) → Pie chart concept
- **Item** (rankings) → Bar chart concept
- **Time Series** (trends) → Line/column concept
- **Frequency** (distributions) → Histogram concept
- **Correlation** (relationships) → Scatter plot concept
- **Multidimensional** (complex data) → Bubble chart concept
If report has lot of data, use charts

### 2. Color Coding System:
- <span style="color: #E3120B; font-weight: bold;">Critical/Primary points</span> (Red)
- <span style="color: #006BA2;">Definitions/Technical</span> (Blue)
- <span style="color: #379A8B;">Examples/Success</span> (Green)
- <span style="color: #EBB434;">Warnings/Caution</span> (Yellow)
- <span style="color: #758D99;">Supporting/Secondary</span> (Grey)

### 3. Visual Elements:
📊 **Comparison Tables** - Bordered with header backgrounds
🎯 **Highlight Boxes** - Border-left accent with background
📝 **Step-by-Step** - Numbered with visual hierarchy
🔄 **Process Flows** - Arrows (→) and indentation
⚠️ **Callout Boxes** - Color-coded warnings/tips/examples
📑 **Collapsible Sections** - <details><summary> for deep-dives
🎨 **Progress Indicators** - Visual bars for percentages
🔢 **Data Cards** - Boxed metrics with large numbers

### 4. Layout Patterns:
- **Side-by-Side**: 2-column layouts with inline-block divs
- **Before/After**: Split screen with clear separation
- **Hierarchical**: Font sizes (h1→h2→h3) + indentation + color
- **Timeline**: Horizontal progression with connecting lines

### 5. Typography Rules:
- **Headlines**: <span style="font-size: 1.3em; font-weight: bold;">Bold, 1.3em</span>
- **Key terms**: <strong>Bold</strong> or <mark style="background: #fff3cd;">Highlighted</mark>
- **Code**: \`inline\` or \`\`\`blocks\`\`\`
- **Emphasis**: Use color over italic when possible

### 6. Text-Based Diagrams with Unicode:
- **Arrows**: → ← ↑ ↓ ↔ ⇒ ⇐ ↗ ↘ ⟶ ⟹ ➜ ➔
- **Boxes**: ┌─┐ │ │ └─┘ ┏━┓ ┃ ┃ ┗━┛ ╔═╗ ║ ║ ╚═╝
- **Bullets**: • ◦ ▪ ▸ ► ◆ ○ ● ■ □
- **Check/Cross**: ✓ ✔ ✗ ✘ ⊗ ⊕
- **Special**: ⚡ ⚠ ⚙ ⭐ 🔒 🔓 📊 📈 📉

### 7. SVG Diagrams (for complex visualizations):

**CRITICAL: Output SVG as raw HTML, NOT in code blocks!**

✅ CORRECT (will render):
<svg width="300" height="200" style="border: 1px solid #ddd;">
  <rect x="50" y="50" width="40" height="100" fill="#006BA2"/>
  <text x="70" y="170" text-anchor="middle" font-size="12">A</text>
</svg>

❌ WRONG (will show as text):
\`\`\`svg
<svg width="300" height="200">
  ...
</svg>
\`\`\`

**Simple Bar Chart Example:**
<svg width="300" height="200" style="border: 1px solid #ddd;">
  <rect x="50" y="50" width="40" height="100" fill="#006BA2"/>
  <rect x="110" y="80" width="40" height="70" fill="#379A8B"/>
  <rect x="170" y="30" width="40" height="120" fill="#E3120B"/>
  <text x="70" y="170" text-anchor="middle" font-size="12">A</text>
  <text x="130" y="170" text-anchor="middle" font-size="12">B</text>
  <text x="190" y="170" text-anchor="middle" font-size="12">C</text>
</svg>

**Flowchart Example:**
<svg width="400" height="100">
  <rect x="10" y="30" width="80" height="40" fill="#f0f8ff" stroke="#006BA2" stroke-width="2" rx="5"/>
  <text x="50" y="55" text-anchor="middle" font-size="14">Start</text>
  <path d="M 90 50 L 130 50" stroke="#758D99" stroke-width="2" marker-end="url(#arrow)"/>
  <rect x="130" y="30" width="80" height="40" fill="#e8f5f3" stroke="#379A8B" stroke-width="2" rx="5"/>
  <text x="170" y="55" text-anchor="middle" font-size="14">End</text>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto">
      <polygon points="0 0, 10 3, 0 6" fill="#758D99"/>
    </marker>
  </defs>
</svg>

**Note**: Output SVG directly in your response, NOT in \`\`\`svg code blocks\`\`\`.

### 8. HTML/CSS Diagram Patterns:

**Simple Flowchart:**
<div style="display: flex; align-items: center; gap: 20px; margin: 20px 0; flex-wrap: wrap;">
  <div style="padding: 15px; border: 2px solid #006BA2; border-radius: 8px; background: #f0f8ff;">Step 1</div>
  <div style="font-size: 2em; color: #758D99;">→</div>
  <div style="padding: 15px; border: 2px solid #006BA2; border-radius: 8px; background: #f0f8ff;">Step 2</div>
  <div style="font-size: 2em; color: #758D99;">→</div>
  <div style="padding: 15px; border: 2px solid #379A8B; border-radius: 8px; background: #e8f5f3;">Done</div>
</div>

**Vertical Timeline:**
<div style="border-left: 4px solid #006BA2; padding-left: 20px; margin: 20px 0;">
  <div style="margin-bottom: 20px;">
    <div style="display: inline-block; width: 16px; height: 16px; background: #006BA2; border-radius: 50%; margin-left: -32px; margin-right: 12px;"></div>
    <strong style="color: #006BA2;">Phase 1:</strong> Description
  </div>
</div>

**Hierarchy/Org Chart:**
<div style="text-align: center; margin: 20px 0;">
  <div style="display: inline-block; padding: 15px 30px; border: 2px solid #E3120B; border-radius: 8px; background: #fff0ef; font-weight: bold;">Top</div>
  <div style="margin: 10px 0; color: #758D99; font-size: 1.5em;">│</div>
  <div style="display: flex; justify-content: center; gap: 40px;">
    <div style="padding: 10px 20px; border: 2px solid #006BA2; border-radius: 8px; background: #f0f8ff;">A</div>
    <div style="padding: 10px 20px; border: 2px solid #379A8B; border-radius: 8px; background: #e8f5f3;">B</div>
  </div>
</div>

**Circular Process:**
<div style="display: flex; justify-content: center; align-items: center; gap: 30px; margin: 30px 0; flex-wrap: wrap;">
  <div style="width: 100px; height: 100px; border: 3px solid #006BA2; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #f0f8ff; font-weight: bold;">Plan</div>
  <div style="font-size: 2em; color: #758D99;">→</div>
  <div style="width: 100px; height: 100px; border: 3px solid #379A8B; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #e8f5f3; font-weight: bold;">Do</div>
</div>

### 8. McKinsey-Style Frameworks:

**2x2 Matrix:**
<div style="position: relative; width: 400px; height: 400px; margin: 30px auto; border: 2px solid #758D99;">
  <div style="position: absolute; top: 0; left: 0; width: 50%; height: 50%; border-right: 2px solid #758D99; border-bottom: 2px solid #758D99; padding: 20px; background: #f0f8ff; box-sizing: border-box;">
    <strong>Quadrant 1</strong>
  </div>
  <div style="position: absolute; top: 0; right: 0; width: 50%; height: 50%; border-bottom: 2px solid #758D99; padding: 20px; background: #e8f5f3; box-sizing: border-box;">
    <strong>Quadrant 2</strong>
  </div>
  <div style="position: absolute; bottom: 0; left: 0; width: 50%; height: 50%; border-right: 2px solid #758D99; padding: 20px; background: #fffbf0; box-sizing: border-box;">
    <strong>Quadrant 3</strong>
  </div>
  <div style="position: absolute; bottom: 0; right: 0; width: 50%; height: 50%; padding: 20px; background: #fff0ef; box-sizing: border-box;">
    <strong>Quadrant 4</strong>
  </div>
</div>

**Funnel:**
<div style="margin: 30px auto; width: 400px;">
  <div style="background: #006BA2; color: white; padding: 15px; text-align: center; font-weight: bold;">Top</div>
  <div style="background: #3EBCD2; color: white; padding: 15px; text-align: center; margin: 5px 30px; font-weight: bold;">Middle</div>
  <div style="background: #379A8B; color: white; padding: 15px; text-align: center; margin: 5px 60px; font-weight: bold;">Bottom</div>
</div>

---

## When to Visualize:
✅ Comparing 2+ items → Table or chart
✅ Showing process → Numbered steps with visual flow
✅ Highlighting key stat → Large number in colored box
✅ Complex relationship → Diagram with connecting elements
❌ Simple fact → Just state it clearly

---

## HTML/CSS Templates:

**Metric Card:**
<div style="border: 2px solid #006BA2; border-radius: 8px; padding: 16px; margin: 10px 0; background: #f0f8ff;">
<div style="font-size: 2em; font-weight: bold; color: #E3120B;">42%</div>
<div style="color: #758D99;">Metric</div>
</div>

**Warning Box:**
<div style="border-left: 4px solid #EBB434; background: #fffbf0; padding: 12px; margin: 10px 0;">
⚠️ <strong>Important:</strong> Content
</div>

**Comparison Table:**
<table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
<thead style="background: #006BA2; color: white;">
<tr><th style="padding: 8px;">Item</th><th>Value</th></tr>
</thead>
<tbody>
<tr style="background: #f8f9fa;"><td style="padding: 8px;">A</td><td>1</td></tr>
</tbody>
</table>

**Progress Bar:**
<div style="background: #E9EDF0; height: 20px; border-radius: 4px; margin: 10px 0;">
<div style="background: #379A8B; width: 65%; height: 100%; border-radius: 4px; display: flex; align-items: center; padding-left: 8px; color: white; font-weight: bold;">65%</div>
</div>

---

## Content-Specific Guidelines:

### For Code/Programming:
- Provide runnable code with syntax highlighting
- Include input/output examples with sample data
- Explain edge cases and error handling
- Show alternative approaches when relevant
- **Be specific**: Don't just describe, show actual code

### For Mathematical Content:
- **ABSOLUTELY CRITICAL**: Write equations as complete continuous strings, NEVER character-by-character
- Use plain text/markdown for equations: "f(x) = x^2" or "y = mx + b"
- Or use Unicode: "Σ, ∫, ≤, ≥, ≠, ±, ×, ÷, √"
- Show step-by-step derivations IN WORDS or simple notation
- Explain intuition behind formulas
- **BAD OUTPUT**: "$ I = 1 T 1 N ∑ i = 1" (character-by-character)
- **GOOD OUTPUT**: "I = (1/T)(1/N)Σwij" or describe verbally

### For Data/Tables:
- Format tables clearly in markdown or HTML
- Extract and highlight key data points
- Point out trends, patterns, anomalies
- Create comparison views when asked

### For Processes/Instructions:
- Use numbered lists for sequential steps
- Include timing/duration estimates
- List prerequisites or requirements
- Provide troubleshooting tips

---

## Response Quality Guidelines:

✅ **Do:**
- Always elaborate and use maximum tokens available
- Match document's sophistication level
- Build on previous conversation context (avoid repetition)
- Suggest logical follow-up questions
- Point to related sections for deeper exploration
- Be visual when it helps comprehension

❌ **Avoid:**
- Lengthy preambles or throat-clearing
- Speculation beyond document content
- Walls of plain text when visuals would help
- Over-formatting (keep it clean and purposeful)
- Repeating explanations from earlier in conversation
- Meta-commentary when asked for creative rewrites (just do it)
- SVG is supported - use for diagrams, charts, and visualizations (keep it simple)
- DO NOT output mathematical expressions character-by-character (this breaks rendering completely)
- DO NOT output HTML tags character-by-character (write complete tags)
- Avoid complex CSS in tables that may not render properly

---

## Special Instructions:
- **For creative requests** (rewrite fiction, change style): Just do it directly, no preamble
- **For code requests**: Show actual working code, not descriptions
- **For data**: Include sample data, be granular with inputs/outputs
- **Use all available tokens**: Comprehensive answers are valued`;


  // Build USER message content with delta logic
  let userContent = '';
  const includedPages = contextInfo && Array.isArray(contextInfo.includedPages) ? contextInfo.includedPages : [];

  // Session lookup
  const sid = conversationId || null;
  const prior = sid ? sessions.get(sid) : null;
  const prevSig = prior ? prior.pageSig : '';
  const currSig = sigFromPages(includedPages);

  // Determine delta vs full send
  const contextSameAsBefore = !!prior && prevSig === currSig;
  const havePerPageTexts = Array.isArray(pdfPages) && pdfPages.every(p => typeof p.page === 'number' && typeof p.text === 'string');

  // Compute new pages if we have a prior context
  let newPages = [];
  if (prior && includedPages.length) {
    const prevSet = new Set(prior.includedPages || []);
    newPages = includedPages.filter(p => !prevSet.has(p));
  }

  // Log delta optimization status
  console.log(`🔄 Delta optimization: isFirstTurn=${isFirstTurn}, contextSameAsBefore=${contextSameAsBefore}, havePerPageTexts=${havePerPageTexts}, newPages=${newPages.length}`);
  if (contextSameAsBefore) {
    console.log(`✅ Same context detected - sending NO document text (0 tokens saved)`);
  } else if (!isFirstTurn && newPages.length > 0) {
    console.log(`📊 Context changed - sending ONLY ${newPages.length} new pages (delta optimization active)`);
  } else if (isFirstTurn) {
    console.log(`🆕 First turn - sending full context window (${includedPages.length} pages)`);
  }

  // Current Context header (always include if contextInfo provided; it's lightweight)
  if (contextInfo && includedPages.length) {
    const pageRange =
      includedPages.length > 1
        ? `pages ${Math.min(...includedPages)}-${Math.max(...includedPages)}`
        : `page ${includedPages[0]}`;

    userContent += `## Current Context:
- **User's Current Page**: ${contextInfo.currentPage} of ${contextInfo.totalPages}
- **Pages Available to You**: ${pageRange} (${includedPages.length} pages)
${includedPages.length < (contextInfo.totalPages || includedPages.length) ? '- **Note**: You have access to a limited page window around the current location.\n' : ''}
`;
  }

  // Decide what document text to send
  // 1) First turn: send full current window (pdfPages preferred; else pdfText)
  // 2) Subsequent turns, same context: send NO document text (question only)
  // 3) Subsequent turns, context changed:
  //    - If pdfPages provided, send ONLY new pages
  //    - Else fallback: send full current window (since we can't isolate deltas)
  let docBlock = '';

  if (isFirstTurn) {
    if (havePerPageTexts) {
      const ordered = pdfPages
        .filter(x => includedPages.includes(x.page))
        .sort((a, b) => a.page - b.page)
        .map(x => `### Page ${x.page}\n${x.text}`)
        .join('\n\n');
      docBlock = `## PDF Document Content (initial window):\n\n${ordered}`;
    } else {
      docBlock = `## PDF Document Content (initial window):\n\n${pdfText || ''}`;
    }
  } else if (!contextSameAsBefore) {
    if (havePerPageTexts && newPages.length) {
      const newSet = new Set(newPages);
      const ordered = pdfPages
        .filter(x => newSet.has(x.page))
        .sort((a, b) => a.page - b.page)
        .map(x => `### Page ${x.page}\n${x.text}`)
        .join('\n\n');

      if (ordered.trim().length) {
        docBlock = `## PDF Delta (new pages only): ${newPages.sort((a, b) => a - b).join(', ')}\n\n${ordered}\n\n_Reference: prior pages were provided earlier in this conversation._`;
      } else if (pdfText) {
        // Fallback if client didn't send per-page text for these new pages
        docBlock = `## PDF Document Content (updated window):\n\n${pdfText}`;
      }
    } else {
      // No per-page texts; fallback to sending the updated window blob
      if (pdfText) {
        docBlock = `## PDF Document Content (updated window):\n\n${pdfText}`;
      }
    }
  } // else same context: no docBlock

  if (docBlock) {
    userContent += `\n${docBlock}\n`;
  }

  // Always add the question last
  userContent += `\n## User's Question:\n${message}\n\n---\nProvide a clear, well-formatted answer based on the content above.`;

  try {
    // Build messages
    function stripDocBlocks(text) {
  if (!text || typeof text !== 'string') return text;
  // Remove prior full-window or delta blocks up to the next heading or end
  return text
    // Remove "## PDF Document Content ..." sections
    .replace(/## PDF Document Content[\s\S]*?(?=\n## |\n--|$)/g, '')
    // Remove "## PDF Delta ..." sections
    .replace(/## PDF Delta[\s\S]*?(?=\n## |\n--|$)/g, '')
    // Trim extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const messages = [];
if (conversationHistory && conversationHistory.length > 0) {
  for (const m of conversationHistory) {
    messages.push({
      role: m.role,
      content: stripDocBlocks(m.content)
    });
  }
}
messages.push({ role: 'user', content: userContent }); // userContent already delta-safe


    const requestBody = {
      model: MODEL,
      max_tokens: 64000,
      stream: true,
      system: systemPrompt,
      messages
    };

    console.log(
      '🚀 Sending request to Anthropic API...',
    );

    // Log compact request (omit large content)
    const safeLog = {
      ...requestBody,
      messages: [
        ...(messages.length > 1 ? messages.slice(0, -1) : []),
        { role: 'user', content: '[omitted large content]' }
      ],
      system: '[system prompt]'
    };
    console.log('📦 Request body (compact):', JSON.stringify(safeLog, null, 2).substring(0, 400) + '...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': effectiveApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('📡 Response received. Status:', response.status);
    const responseHeaders = Object.fromEntries(response.headers.entries());
    console.log('📋 Response headers:', responseHeaders);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('API Error:', response.status, errorData);
      if (!res.headersSent) {
        return res.status(response.status).json({
          error: `API error: ${response.status}`,
          details: errorData
        });
      }
      return;
    }

    const anthropicContentType = response.headers.get('content-type');
    console.log('🔍 Anthropic response content-type:', anthropicContentType);

    if (!anthropicContentType || !anthropicContentType.includes('text/event-stream')) {
      console.warn('⚠️ Anthropic did not return a stream! Returning JSON response directly...');
      const data = await response.json();
      // Update session cache before returning
      updateSessionCache(sid, includedPages, currSig, havePerPageTexts, pdfPages);
      return res.json(data);
    }

    // SSE headers - properly configure for streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Transfer-Encoding': 'chunked'
    });

    console.log('✅ Starting stream...');

    // Stream the response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;

    // Handle client disconnect
    req.on('close', () => {
      console.log('⚠️ Client disconnected early');
      reader.cancel();
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(`Stream complete. Total chunks: ${chunkCount}`);
          res.write('data: [DONE]\n\n');
          res.end();
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            chunkCount++;
            const written = res.write(`data: ${data}\n\n`);
            // If buffer is full, wait for drain
            if (!written) {
              await new Promise(resolve => res.once('drain', resolve));
            }
          }
        }
      }
    } catch (streamError) {
      console.error('Stream error:', streamError);
      // Don't try to send JSON after streaming has started
      if (!res.writableEnded) {
        res.end();
      }
    } finally {
      // Update session cache after a successful stream
      updateSessionCache(sid, includedPages, currSig, havePerPageTexts, pdfPages);
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Update session cache helper
function updateSessionCache(sid, includedPages, pageSig, havePerPageTexts, pdfPages) {
  if (!sid) return; // no conversation id, no caching
  const rec = sessions.get(sid) || {};
  rec.pageSig = pageSig;
  rec.includedPages = includedPages ? includedPages.slice() : [];
  if (havePerPageTexts) {
    // Track which pages we've already sent so we can compute future deltas
    const sentSet = new Set(rec.sentPages || []);
    for (const p of pdfPages) {
      if (includedPages.includes(p.page)) sentSet.add(p.page);
    }
    rec.sentPages = Array.from(sentSet);
  }
  sessions.set(sid, rec);
}

// API endpoint to fetch and extract webpage content
// Convert URL to PDF endpoint
app.post('/api/url-to-pdf', async (req, res) => {
  const { url } = req.body;

  console.log('📨 Received URL to PDF request:', url);

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  let browser = null;

  try {
    console.log(`🌐 Launching browser and navigating to: ${url}`);

    // Find Chrome executable path with platform-specific fallbacks
    let executablePath;
    try {
      executablePath = puppeteer.executablePath();
      console.log(`✅ Found Chrome at: ${executablePath}`);
    } catch (err) {
      console.warn('⚠️ Could not auto-detect Chrome, trying fallbacks...');

      // Try environment variable first
      executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

      // Platform-specific Chrome locations
      if (!executablePath) {
        const fs = require('fs');
        const platformPaths = {
          darwin: [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
          ],
          linux: [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium'
          ],
          win32: [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
          ]
        };

        const paths = platformPaths[process.platform] || [];
        for (const chromePath of paths) {
          if (fs.existsSync(chromePath)) {
            executablePath = chromePath;
            console.log(`✅ Found Chrome at fallback location: ${executablePath}`);
            break;
          }
        }
      }

      if (!executablePath) {
        console.error('❌ Could not find Chrome executable on this system');
      }
    }

    // Launch headless browser
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ]
    });

    const page = await browser.newPage();

    // Set viewport for consistent rendering
    await page.setViewport({ width: 1200, height: 800 });

    // Navigate to URL with timeout
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    console.log('📄 Page loaded, generating PDF...');

    // Generate PDF with good settings
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });

    await browser.close();
    browser = null;

    console.log(`✅ PDF generated (${pdfBuffer.length} bytes)`);

    // Send PDF as binary data (use end() to avoid any Express transformations)
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length,
      'Content-Disposition': 'inline'
    });
    res.end(pdfBuffer, 'binary');

  } catch (error) {
    console.error('❌ Error converting URL to PDF:', error);

    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }

    res.status(500).json({
      error: 'Failed to convert webpage to PDF',
      details: error.message
    });
  }
});

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 PDF.AI Reader server running at http://localhost:${PORT}`);
  console.log(`📄 Open http://localhost}:${PORT} in your browser to use the app`);
});
