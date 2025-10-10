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
    const { message, pdfText, contextInfo } = req.body;

    console.log('📨 Received chat request:', { message: message.substring(0, 50) + '...' });

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
    let systemMessage = `You are an expert AI assistant helping users understand and analyze PDF documents. Your role is to provide clear, accurate, and well-structured responses.

## Response Guidelines:
1. **Prioritize PDF Content**: Base your answer primarily on the provided PDF document
2. **Supplement with Knowledge**: You can also use your general knowledge to:
   - Explain concepts mentioned in the PDF
   - Provide additional context or examples
   - Answer follow-up questions that relate to the PDF topic
   - Clarify terminology or technical details
3. **Use Formatting**: Use markdown for readability (headings, lists, bold, etc.) when appropriate
4. **Cite Pages**: Reference specific page numbers when quoting from the PDF (e.g., "On page 5...")
5. **Adapt to Content**:
   - If the PDF contains code, provide code examples with proper language syntax highlighting
   - If the PDF contains mathematical equations, use LaTeX notation ($...$ for inline, $$...$$ for display)
   - If the PDF is a report or article, summarize and explain clearly
   - Match your response style to the document type

## Key Principles:
- Always indicate whether information is from the PDF or your general knowledge
- Be direct and comprehensive
- Structure complex answers with headings and sections
- Quote relevant text when it helps clarify your answer`;

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
        const requestBody = {
            model: MODEL,
            max_tokens: 64000,
            stream: true, // Enable streaming
            messages: [
                {
                    role: 'user',
                    content: systemMessage
                }
            ]
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
