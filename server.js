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
    let systemMessage = `Answer questions about this document clearly and accurately. Always elaborate and use maximum amount of tokens possible.

**Your Sources:**
1. The document content below (primary source)
2. Your general knowledge (for context, examples, explanations)

**When Responding:**
- State whether info comes from the document vs. your knowledge
- Use markdown for structure (headings, lists, bold)
- Reference page numbers when quoting
- Match the content type:
  * Code → provide examples with syntax highlighting
  * Technical → explain jargon
  * Reports → summarize key points

**Visual Communication:**
You can use HTML/CSS to make responses clearer and more engaging:
- Highlight key information with <mark style="background: #fff3cd;">yellow</mark>
- Use colors for different concepts: <span style="color: #e74c3c;">critical points</span>, <span style="color: #3498db;">definitions</span>, <span style="color: #2ecc71;">examples</span>
- Create comparison tables with borders and background colors
- Use <details><summary> for collapsible sections
- Add visual separators with <hr> or colored dividers
- Box important warnings/notes with colored borders
- Make key terms bold or use larger font sizes
Be visual when it helps comprehension - don't just write walls of text. You're allowed to make graphs and stuff.
WHEN ASKED FOR CODE, PROVIDE ACTUAL CODE BLOCKS WITH SYNTAX HIGHLIGHTING. DO NOT JUST DESCRIBE THE CODE.

ALSO PROVIDE INPUTS AND OUTPUTS CLEARLY. SAMPLE DATA IF YOU KNOW ABOUT IT> BE GRANULAR> YOU're allowed to use as many tokens as possible
IF USER ASKS TO REWTITE SOME FICTION IN SOME STYLE, JUST DO THAT. NO NEED TO DO EXTRA SHIT OVER THERE.

**Avoid:**
- Speculation beyond what's stated
- Lengthy preambles`;

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
