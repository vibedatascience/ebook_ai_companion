const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

// API Configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-5-20250929';

if (!ANTHROPIC_API_KEY) {
    console.warn('⚠️ ANTHROPIC_API_KEY is not set. The server will expect each request to supply an API key header.');
}

// Middleware
app.use(cors({
    exposedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// API endpoint to chat with Claude
app.post('/api/chat', async (req, res) => {
    const { message, pdfText, contextInfo, conversationHistory } = req.body;

    console.log('📨 Received chat request:', {
        message: message.substring(0, 50) + '...',
        historyLength: conversationHistory ? conversationHistory.length : 0
    });

    if (!message || !pdfText) {
        return res.status(400).json({ error: 'Message and PDF text are required' });
    }

    const requestApiKeyHeader = (req.headers['x-api-key'] || '').toString().trim();
    const effectiveApiKey = requestApiKeyHeader || ANTHROPIC_API_KEY;

    if (!effectiveApiKey) {
        return res.status(500).json({
            error: 'Server misconfiguration',
            details: 'No Anthropic API key provided. Set ANTHROPIC_API_KEY or supply an x-api-key header.'
        });
    }

    // Build enhanced system message
    let systemMessage = `You are an AI document assitant with advanced visual communication capabilities. 

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

## Citation System:
- **Direct quotes**: "exact text" [p.5]
- **Paraphrasing**: According to page 7, ... or [p.7]
- **Cross-references**: "This relates to the concept on page 12"
- **Confidence levels**:
  - High: "The document clearly states..." [p.X]
  - Medium: "Based on page X, it appears..."
  - Low: "The document doesn't explicitly address this, but..."

---

## Core Formatting Rules
- Default to **Markdown** for structure. Use HTML only when it adds clear visual value.
- Keep paragraphs intact; avoid wrapping every sentence in its own `<p>` or emitting stray closing tags.
- When presenting formulas or equations, keep the expression continuous—no character-per-line output.
- Use LaTeX delimiters: inline with \\( ... \\) or $ ... $, block with $$ ... $$.
- Never strip LaTeX commands; allow the client to render them.

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

### 7. HTML/CSS Diagram Patterns:

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
- Use simple LaTeX only (avoid complex multi-line equations that break rendering)
- Show step-by-step derivations
- Explain intuition behind formulas
- Inline: $f(x) = x^2$ | Display: $$y = mx + b$$
- Keep mathematical expressions on a single line or in a single LaTeX block—do not insert spaces or hard line breaks between every character or symbol.

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
- DO not use SVG as it may not render properly
- DO not use LAtex as it is not rendering properly. In fact avoid complex formatting that may break rendering
- Do not use complex CSS in tables as it may not render properly

---

## Special Instructions:
- **For creative requests** (rewrite fiction, change style): Just do it directly, no preamble
- **For code requests**: Show actual working code, not descriptions
- **For data**: Include sample data, be granular with inputs/outputs
- **Use all available tokens**: Comprehensive answers are valued`;

    if (contextInfo && contextInfo.includedPages) {
        const pageRange = contextInfo.includedPages.length > 1
            ? `pages ${contextInfo.includedPages[0]}-${contextInfo.includedPages[contextInfo.includedPages.length - 1]}`
            : `page ${contextInfo.includedPages[0]}`;

        systemMessage += `\n\n## Current Context:
- **User's Current Page**: ${contextInfo.currentPage} of ${contextInfo.totalPages}
- **Pages Available to You**: ${pageRange} (${contextInfo.includedPages.length} pages)`;

        // If not all pages are included, let Claude know
        if (contextInfo.includedPages.length < contextInfo.totalPages) {
            systemMessage += `
- **Note**: For a large PDF, you only have access to pages around the user's current location. If the answer requires information from other sections, politely suggest the user navigate to those pages.`;
        }
    }

    systemMessage += `\n\n## PDF Document Content:\n\n${pdfText}\n\n## User's Question:\n${message}\n\n---\n\nProvide a clear, well-formatted answer based on the PDF content above.`;

    try {
        // Build messages array with conversation history
        const messages = [];

        // Add conversation history if present
        if (conversationHistory && conversationHistory.length > 0) {
            // First message includes the system context + first user question
            messages.push({
                role: 'user',
                content: systemMessage.replace(
                    `## User's Question:\n${message}`,
                    `## User's Question:\n${conversationHistory[0].content}`
                )
            });

            // Add the rest of the conversation
            for (let i = 1; i < conversationHistory.length; i++) {
                messages.push(conversationHistory[i]);
            }
        }

        // Add current message
        messages.push({
            role: 'user',
            content: conversationHistory && conversationHistory.length > 0
                ? message  // Just the message if we have history
                : systemMessage  // Full context if first message
        });

        const requestBody = {
            model: MODEL,
            max_tokens: 64000,
            stream: true, // Enable streaming
            messages: messages
        };

        console.log('🚀 Sending request to Anthropic API...');
        console.log('📦 Request body:', JSON.stringify(requestBody, null, 2).substring(0, 200) + '...');

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

            // Don't try to set streaming headers if there was an error
            if (!res.headersSent) {
                return res.status(response.status).json({
                    error: `API error: ${response.status}`,
                    details: errorData
                });
            }
            return;
        }

        // Check if Anthropic returned a streaming response
        const anthropicContentType = response.headers.get('content-type');
        console.log('🔍 Anthropic response content-type:', anthropicContentType);

        if (!anthropicContentType || !anthropicContentType.includes('text/event-stream')) {
            console.warn('⚠️ Anthropic did not return a stream! Returning JSON response directly...');
            // Anthropic returned JSON instead of stream - just forward it
            const data = await response.json();
            return res.json(data);
        }

        // Set headers for SSE (Server-Sent Events)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        console.log('✅ Starting stream...');

        // Stream the response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let chunkCount = 0;

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

                        // Forward the chunk to client
                        res.write(`data: ${data}\n\n`);
                    }
                }
            }
        } catch (streamError) {
            console.error('Stream error:', streamError);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Streaming error', details: streamError.message });
            }
        }

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            error: 'Internal server error',
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
    console.log(`📄 Open http://localhost:${PORT} in your browser to use the app`);
});
