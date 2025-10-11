// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// API Configuration
const DEFAULT_API_URL = 'http://localhost:3001/api/chat';
const globalConfig = typeof window !== 'undefined' ? window.PDF_AI_CONFIG : undefined;
const API_URL = (globalConfig && globalConfig.API_URL) || DEFAULT_API_URL;

if (globalConfig && globalConfig.API_URL && globalConfig.API_URL !== DEFAULT_API_URL) {
    console.info(`📡 Using custom API endpoint: ${globalConfig.API_URL}`);
}

const API_KEY_STORAGE_KEY = 'anthropicApiKey';
let userApiKey = '';

// Document Types
const DocumentType = {
    PDF: 'pdf',
    EPUB: 'epub',
    TEXT: 'text'
};

// State
let documentType = null;
let pdfDocument = null;
let epubBook = null;
let epubRendition = null;
let epubSpineItems = [];
let epubFontSize = 100;
let epubHrefToIndex = {};
let currentPage = 1;
let pdfText = ''; // Also reused for EPUB full text context
let pdfPageTexts = {}; // Stores page/chapter text for PDF or EPUB
let selectedText = '';
let scale = 1.5;
let rendering = false;
const MAX_CONTEXT_TOKENS = 150000; // Conservative limit (leave 50k buffer for system prompt + response)
let chatFontSize = 14; // Default font size in pixels
let textZoom = 1; // Scale multiplier for plain text documents
let conversationHistory = []; // Store conversation messages for context
let currentStream = null; // Track active streaming request for cancellation

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const headerUploadBtn = document.getElementById('headerUploadBtn');
const container = document.querySelector('.container');
const paneResizer = document.getElementById('paneResizer');
const pdfSection = document.querySelector('.pdf-section');
const chatSidebar = document.querySelector('.chat-sidebar');
const pdfViewer = document.getElementById('pdfViewer');
const pdfContainer = document.getElementById('pdfContainer');
const epubContainer = document.getElementById('epubContainer');
const textContainer = document.getElementById('textContainer');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInput = document.getElementById('pageInput');
const pageTotal = document.getElementById('pageTotal');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const fitWidthBtn = document.getElementById('fitWidth');
const fitPageBtn = document.getElementById('fitPage');
const zoomLevel = document.getElementById('zoomLevel');
const newFileBtn = document.getElementById('newFileBtn');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
const resetChatBtn = document.getElementById('resetChatBtn');
const contextMenu = document.getElementById('contextMenu');
const copyTextBtn = document.getElementById('copyText');
const explainTextBtn = document.getElementById('explainText');
const sendToChatBtn = document.getElementById('sendToChat');
const increaseFontBtn = document.getElementById('increaseFontBtn');
const decreaseFontBtn = document.getElementById('decreaseFontBtn');
const fontSizeLabel = document.getElementById('fontSizeLabel');
const apiKeyBtn = document.getElementById('apiKeyBtn');
const apiKeyStatus = document.getElementById('apiKeyStatus');
const apiKeyModal = document.getElementById('apiKeyModal');
const apiKeyBackdrop = document.getElementById('apiKeyBackdrop');
const apiKeyClose = document.getElementById('apiKeyClose');
const apiKeyForm = document.getElementById('apiKeyForm');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyClear = document.getElementById('apiKeyClear');

// Event Listeners
uploadBtn.addEventListener('click', () => fileInput.click());
if (headerUploadBtn) {
    headerUploadBtn.addEventListener('click', () => fileInput.click());
}
fileInput.addEventListener('change', handleFileSelect);
prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
pageInput.addEventListener('change', (e) => goToPage(parseInt(e.target.value)));
zoomInBtn.addEventListener('click', () => changeZoom(0.25));
zoomOutBtn.addEventListener('click', () => changeZoom(-0.25));
fitWidthBtn.addEventListener('click', () => fitToWidth());
fitPageBtn.addEventListener('click', () => fitToPage());
newFileBtn.addEventListener('click', resetApp);
sendBtn.addEventListener('click', sendMessage);
resetChatBtn.addEventListener('click', resetChat);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

if (stopStreamBtn) {
    stopStreamBtn.style.display = 'none';
    stopStreamBtn.addEventListener('click', stopCurrentStream);
}

// Auto-resize textarea
chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Context menu event listeners
document.addEventListener('mouseup', handleTextSelection);
document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
        contextMenu.style.display = 'none';
    }
});
copyTextBtn.addEventListener('click', copySelectedText);
explainTextBtn.addEventListener('click', explainSelectedText);
sendToChatBtn.addEventListener('click', sendSelectedTextToChat);
increaseFontBtn.addEventListener('click', increaseChatFontSize);
decreaseFontBtn.addEventListener('click', decreaseChatFontSize);

if (apiKeyBtn) {
    apiKeyBtn.addEventListener('click', () => {
        if (!apiKeyModal) return;
        apiKeyModal.classList.remove('hidden');
        if (apiKeyInput) {
            apiKeyInput.value = userApiKey || '';
            apiKeyInput.focus();
        }
    });
}

if (apiKeyClose) {
    apiKeyClose.addEventListener('click', hideApiKeyModal);
}

if (apiKeyBackdrop) {
    apiKeyBackdrop.addEventListener('click', hideApiKeyModal);
}

if (apiKeyForm) {
    apiKeyForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!apiKeyInput) return;
        const value = apiKeyInput.value.trim();
        if (value) {
            try {
                localStorage.setItem(API_KEY_STORAGE_KEY, value);
                userApiKey = value;
                updateApiKeyStatus();
            } catch (storageError) {
                console.error('Failed to store API key:', storageError);
            }
        }
        hideApiKeyModal();
    });
}

if (apiKeyClear) {
    apiKeyClear.addEventListener('click', () => {
        try {
            localStorage.removeItem(API_KEY_STORAGE_KEY);
        } catch (storageError) {
            console.error('Failed to clear API key:', storageError);
        }
        userApiKey = '';
        updateApiKeyStatus();
        if (apiKeyInput) {
            apiKeyInput.value = '';
            apiKeyInput.focus();
        }
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && apiKeyModal && !apiKeyModal.classList.contains('hidden')) {
        hideApiKeyModal();
    }
});

// Pane resizing
if (paneResizer && container && pdfSection && chatSidebar) {
    let isResizing = false;

    const startResize = (event) => {
        event.preventDefault();
        isResizing = true;
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        document.addEventListener('touchmove', handleResize, { passive: false });
        document.addEventListener('touchend', stopResize);
    };

    const handleResize = (event) => {
        event.preventDefault();
        if (!isResizing) return;

        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const containerRect = container.getBoundingClientRect();
        const minWidth = 260;
        const maxWidth = Math.max(minWidth, containerRect.width - minWidth);
        let newLeftWidth = clientX - containerRect.left;

        newLeftWidth = Math.max(minWidth, Math.min(newLeftWidth, maxWidth));
        const leftPercent = (newLeftWidth / containerRect.width) * 100;

        pdfSection.style.flexBasis = `${leftPercent}%`;
        chatSidebar.style.flexBasis = `${100 - leftPercent}%`;
    };

    const stopResize = () => {
        if (!isResizing) return;
        isResizing = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', handleResize);
        document.removeEventListener('touchend', stopResize);
    };

    paneResizer.addEventListener('mousedown', startResize);
    paneResizer.addEventListener('touchstart', startResize, { passive: false });
}

// Handle file selection
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const extension = file.name.split('.').pop().toLowerCase();
    const mimeType = file.type;
    const isPdf = mimeType === 'application/pdf' || extension === 'pdf';
    const isEpub = mimeType === 'application/epub+zip' || extension === 'epub';
    const isText = mimeType === 'text/plain' || extension === 'txt';

    if (!isPdf && !isEpub && !isText) {
        alert('Please select a valid PDF, EPUB, or TXT file');
        return;
    }

    try {
        if (isPdf) {
            await loadPDF(file);
        } else if (isEpub) {
            await loadEPUB(file);
        } else if (isText) {
            await loadText(file);
        }

        uploadArea.style.display = 'none';
        pdfViewer.style.display = 'flex';
        chatInput.disabled = false;
        sendBtn.disabled = false;

        // Clear welcome message and show reset button
        chatMessages.innerHTML = '';
        resetChatBtn.style.display = 'flex';
        const docLabel = isPdf ? 'PDF' : isEpub ? 'EPUB' : 'TXT';
        addMessageToChat('assistant', `${docLabel} loaded! I\u2019m ready to answer questions about your document. You can also select text to copy or ask me to explain it. What would you like to know?`);
    } catch (error) {
        console.error('Error loading document:', error);
        alert('Failed to load document. Please try again.');
    }
}

// Load PDF
async function loadPDF(file) {
    documentType = DocumentType.PDF;
    epubBook = null;
    if (epubRendition) {
        epubRendition.destroy();
        epubRendition = null;
    }
    epubSpineItems = [];
    epubHrefToIndex = {};

    pdfContainer.style.display = 'block';
    epubContainer.style.display = 'none';
    epubContainer.innerHTML = '';
    if (textContainer) {
        textContainer.style.display = 'none';
        textContainer.textContent = '';
    }
    pdfViewer.classList.remove('is-epub');

    const arrayBuffer = await file.arrayBuffer();
    pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;

    currentPage = 1;
    scale = 1.5;
    zoomLevel.textContent = Math.round(scale * 100) + '%';

    // Extract all text from PDF
    pdfText = await extractPdfText();

    // Update page info
    pageTotal.textContent = `/ ${pdfDocument.numPages}`;
    pageInput.max = pdfDocument.numPages;
    pageInput.value = currentPage;

    // Render all pages
    await renderAllPages();

    updatePageInfo();

    // Scroll to top
    pdfContainer.scrollTop = 0;
}

// Load EPUB
async function loadEPUB(file) {
    documentType = DocumentType.EPUB;
    pdfDocument = null;
    scale = 1.5;
    epubFontSize = 100;
    zoomLevel.textContent = `${epubFontSize}%`;

    // Use PDF container for EPUB rendering (simpler approach)
    pdfContainer.style.display = 'block';
    pdfContainer.innerHTML = '';
    epubContainer.style.display = 'none';
    if (textContainer) {
        textContainer.style.display = 'none';
        textContainer.textContent = '';
    }
    pdfViewer.classList.add('is-epub');

    if (epubRendition) {
        epubRendition.destroy();
        epubRendition = null;
    }

    const arrayBuffer = await file.arrayBuffer();
    epubBook = ePub(arrayBuffer);

    await epubBook.ready;

    epubSpineItems = epubBook.spine.spineItems || epubBook.spine.items || [];
    epubHrefToIndex = {};
    pdfPageTexts = {};

    console.log(`Loading EPUB with ${epubSpineItems.length} chapters...`);

    // Extract and render each chapter as an HTML page
    for (let i = 0; i < epubSpineItems.length; i++) {
        const item = epubSpineItems[i];
        try {
            // Load the chapter content
            const doc = await epubBook.load(item.href);

            // Extract text for AI context
            const textContent = doc?.textContent || doc?.body?.textContent || '';
            const cleanText = textContent.replace(/\s+/g, ' ').trim();
            pdfPageTexts[i + 1] = cleanText || '[No textual content]';

            // Extract HTML for visual rendering
            const htmlContent = doc?.innerHTML || doc?.body?.innerHTML || '';

            // Create a chapter page (similar to PDF pages)
            const chapterDiv = document.createElement('div');
            chapterDiv.className = 'epub-page';
            chapterDiv.id = `page-${i + 1}`;
            chapterDiv.setAttribute('data-page', i + 1);

            // Create chapter content wrapper
            const contentDiv = document.createElement('div');
            contentDiv.className = 'epub-content';
            contentDiv.innerHTML = htmlContent;

            chapterDiv.appendChild(contentDiv);
            pdfContainer.appendChild(chapterDiv);

            if (item && item.href) {
                epubHrefToIndex[item.href] = i;
            }

            // Make internal links clickable
            makeLinksClickable(contentDiv, i + 1);
        } catch (err) {
            console.warn('Failed to load chapter', item?.href, err);
            pdfPageTexts[i + 1] = '[Failed to load chapter content]';

            // Still create a placeholder page
            const chapterDiv = document.createElement('div');
            chapterDiv.className = 'epub-page';
            chapterDiv.id = `page-${i + 1}`;
            chapterDiv.innerHTML = '<div class="epub-content"><p>Failed to load chapter content</p></div>';
            pdfContainer.appendChild(chapterDiv);
        }
    }

    // Build full text payload for AI
    pdfText = Object.keys(pdfPageTexts)
        .map((key) => {
            const idx = parseInt(key, 10);
            return `\n\n--- Chapter ${idx} ---\n${pdfPageTexts[key]}`;
        })
        .join('');

    currentPage = 1;
    pageInput.value = currentPage;
    pageInput.max = epubSpineItems.length || 1;
    pageTotal.textContent = `/ ${epubSpineItems.length || 1}`;

    console.log(`EPUB loaded: ${epubSpineItems.length} chapters rendered`);

    updatePageInfo();

    // Scroll to top
    pdfContainer.scrollTop = 0;
}

// Extract text from all PDF pages
async function extractPdfText() {
    let fullText = '';
    pdfPageTexts = {}; // Reset

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');

        // Store per page
        pdfPageTexts[pageNum] = pageText;

        fullText += `\n\n--- Page ${pageNum} ---\n${pageText}`;
    }

    return fullText;
}

// Estimate tokens more conservatively (1 token ≈ 3 characters for safety)
function estimateTokens(text) {
    return Math.ceil(text.length / 3);
}

function getTotalPages() {
    if (documentType === DocumentType.PDF && pdfDocument) {
        return pdfDocument.numPages;
    }

    if (documentType === DocumentType.EPUB) {
        return epubSpineItems.length || Object.keys(pdfPageTexts).length || 0;
    }

    if (documentType === DocumentType.TEXT) {
        return pdfPageTexts[1] ? 1 : 0;
    }

    return 0;
}

// Get smart context window around current page
function getSmartContext(centerPage) {
    const keys = Object.keys(pdfPageTexts)
        .map((key) => parseInt(key, 10))
        .filter((key) => Number.isInteger(key))
        .sort((a, b) => a - b);

    if (keys.length === 0) {
        return {
            text: '',
            pages: [],
            tokens: 0
        };
    }

    if (!pdfPageTexts[centerPage]) {
        centerPage = keys[0];
    }

    const label = documentType === DocumentType.EPUB
        ? 'Chapter'
        : documentType === DocumentType.TEXT
            ? 'Section'
            : 'Page';

    // Start with current page/chapter
    let contextText = `--- ${label} ${centerPage} ---\n${pdfPageTexts[centerPage] || ''}`;
    let currentTokens = estimateTokens(contextText);

    // Expand up and down alternatively
    let expandUp = centerPage - 1;
    let expandDown = centerPage + 1;
    let includedPages = pdfPageTexts[centerPage] ? [centerPage] : [];

    const minPage = keys[0];
    const maxPage = keys[keys.length - 1];

    while ((expandUp >= minPage || expandDown <= maxPage) && currentTokens < MAX_CONTEXT_TOKENS) {
        // Try adding page above
        if (expandUp >= minPage && pdfPageTexts[expandUp]) {
            const pageText = `\n\n--- ${label} ${expandUp} ---\n${pdfPageTexts[expandUp]}`;
            const pageTokens = estimateTokens(pageText);

            if (currentTokens + pageTokens < MAX_CONTEXT_TOKENS) {
                contextText = pageText + contextText; // Prepend
                currentTokens += pageTokens;
                includedPages.unshift(expandUp);
                expandUp--;
            } else {
                expandUp = 0; // Stop expanding up
            }
        } else {
            expandUp = 0;
        }

        // Try adding page below
        if (expandDown <= maxPage && pdfPageTexts[expandDown]) {
            const pageText = `\n\n--- ${label} ${expandDown} ---\n${pdfPageTexts[expandDown]}`;
            const pageTokens = estimateTokens(pageText);

            if (currentTokens + pageTokens < MAX_CONTEXT_TOKENS) {
                contextText += pageText; // Append
                currentTokens += pageTokens;
                includedPages.push(expandDown);
                expandDown++;
            } else {
                expandDown = maxPage + 1; // Stop expanding down
            }
        } else {
            expandDown = maxPage + 1;
        }
    }

    return {
        text: contextText,
        pages: includedPages,
        tokens: currentTokens
    };
}

// Render all pages
async function renderAllPages() {
    if (documentType !== DocumentType.PDF || !pdfDocument) return;

    pdfContainer.innerHTML = '';

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        await renderPage(pageNum);
    }

    updatePageInfo();
}

// Load plain text documents
async function loadText(file) {
    documentType = DocumentType.TEXT;
    pdfDocument = null;
    epubBook = null;
    if (epubRendition) {
        epubRendition.destroy();
        epubRendition = null;
    }
    epubSpineItems = [];
    epubHrefToIndex = {};

    pdfContainer.style.display = 'none';
    pdfContainer.innerHTML = '';
    epubContainer.style.display = 'none';
    epubContainer.innerHTML = '';
    if (textContainer) {
        textContainer.style.display = 'block';
    }
    pdfViewer.classList.remove('is-epub');

    const text = await file.text();

    pdfText = text;
    pdfPageTexts = { 1: text };
    currentPage = 1;
    textZoom = 1;
    zoomLevel.textContent = '100%';

    if (textContainer) {
        textContainer.textContent = text;
        applyTextZoom();
        textContainer.scrollTop = 0;
    }

    pageInput.value = 1;
    pageInput.max = 1;
    pageTotal.textContent = '/ 1';

    updatePageInfo();
}

// Render single page
async function renderPage(pageNumber) {
    if (documentType !== DocumentType.PDF || !pdfDocument) return;

    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: scale });

    // Create page container
    const pageDiv = document.createElement('div');
    pageDiv.className = 'pdf-page';
    pageDiv.id = `page-${pageNumber}`;
    pageDiv.style.width = viewport.width + 'px';
    pageDiv.style.height = viewport.height + 'px';

    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Create text layer
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';

    pageDiv.appendChild(canvas);
    pageDiv.appendChild(textLayerDiv);
    pdfContainer.appendChild(pageDiv);

    // Render canvas
    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };
    await page.render(renderContext).promise;

    // Render text layer
    const textContent = await page.getTextContent();

    // Set CSS scale factor
    textLayerDiv.style.setProperty('--scale-factor', scale);

    pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: []
    });

    // Add link/annotation layer for clickable links
    try {
        const annotations = await page.getAnnotations();

        annotations.forEach(annotation => {
            if (annotation.subtype === 'Link') {
                const linkElement = document.createElement('a');
                linkElement.className = 'pdf-link-annotation';

                // Position the link overlay
                const rect = annotation.rect;
                const [x1, y1, x2, y2] = rect;

                linkElement.style.position = 'absolute';
                linkElement.style.left = `${Math.min(x1, x2)}px`;
                linkElement.style.top = `${viewport.height - Math.max(y1, y2)}px`;
                linkElement.style.width = `${Math.abs(x2 - x1)}px`;
                linkElement.style.height = `${Math.abs(y2 - y1)}px`;
                linkElement.style.cursor = 'pointer';
                linkElement.style.background = 'rgba(242, 101, 50, 0.1)';
                linkElement.style.border = '1px solid rgba(242, 101, 50, 0.3)';
                linkElement.style.transition = 'background 0.2s';

                linkElement.addEventListener('mouseenter', () => {
                    linkElement.style.background = 'rgba(242, 101, 50, 0.2)';
                });

                linkElement.addEventListener('mouseleave', () => {
                    linkElement.style.background = 'rgba(242, 101, 50, 0.1)';
                });

                // Handle different link types
                if (annotation.url) {
                    // External URL
                    linkElement.href = annotation.url;
                    linkElement.target = '_blank';
                    linkElement.rel = 'noopener noreferrer';
                    linkElement.title = `Open: ${annotation.url}`;
                } else if (annotation.dest) {
                    // Internal destination (page reference)
                    linkElement.addEventListener('click', async (e) => {
                        e.preventDefault();

                        try {
                            const dest = typeof annotation.dest === 'string'
                                ? await pdfDocument.getDestination(annotation.dest)
                                : annotation.dest;

                            if (dest && dest[0]) {
                                const pageRef = dest[0];
                                const targetPageNum = await pdfDocument.getPageIndex(pageRef) + 1;
                                goToPage(targetPageNum);
                            }
                        } catch (err) {
                            console.warn('Failed to navigate to destination:', err);
                        }
                    });
                    linkElement.title = 'Jump to section';
                }

                pageDiv.appendChild(linkElement);
            }
        });
    } catch (err) {
        console.warn('Failed to render annotations:', err);
    }
}

// Page navigation
function goToPage(pageNum) {
    const totalPages = getTotalPages();
    if (pageNum < 1 || pageNum > totalPages || pageNum === currentPage) {
        return;
    }

    currentPage = pageNum;
    pageInput.value = currentPage;

    if (documentType === DocumentType.PDF) {
        // Scroll to page
        const pageElement = document.getElementById(`page-${pageNum}`);
        if (pageElement) {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } else if (documentType === DocumentType.EPUB && epubRendition) {
        const spineItem = epubSpineItems[pageNum - 1];
        if (spineItem) {
            epubRendition.display(spineItem.href || spineItem);
        }
    } else if (documentType === DocumentType.TEXT && textContainer) {
        textContainer.scrollTop = 0;
    }

    updatePageInfo();
}

// Update page info and buttons
function updatePageInfo() {
    const totalPages = getTotalPages();
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = totalPages === 0 || currentPage >= totalPages;
}

// Zoom controls
function changeZoom(delta) {
    if (documentType === DocumentType.PDF) {
        scale += delta;
        scale = Math.max(0.5, Math.min(scale, 3)); // Limit between 50% and 300%
        zoomLevel.textContent = Math.round(scale * 100) + '%';
        renderAllPages();
    } else if (documentType === DocumentType.EPUB && epubRendition) {
        epubFontSize += delta * 25;
        epubFontSize = Math.max(60, Math.min(epubFontSize, 200));
        const fontSize = Math.round(epubFontSize);
        epubRendition.themes.fontSize(`${fontSize}%`);
        zoomLevel.textContent = `${fontSize}%`;
    } else if (documentType === DocumentType.TEXT && textContainer) {
        textZoom += delta;
        textZoom = Math.max(0.5, Math.min(textZoom, 3));
        applyTextZoom();
        zoomLevel.textContent = Math.round(textZoom * 100) + '%';
    }
}

function applyTextZoom() {
    if (!textContainer) return;
    const clamped = Math.max(0.5, Math.min(textZoom, 3));
    const baseFontSize = 16;
    const fontSize = Math.round(baseFontSize * clamped);
    const lineHeight = Math.max(1.2, 1.2 * clamped + 0.4);

    textContainer.style.fontSize = `${fontSize}px`;
    textContainer.style.lineHeight = `${lineHeight.toFixed(2)}`;
}

async function fitToWidth() {
    if (documentType === DocumentType.PDF && pdfDocument) {
        const containerWidth = pdfContainer.clientWidth - 40; // padding
        const page = await pdfDocument.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        scale = containerWidth / viewport.width;
        zoomLevel.textContent = Math.round(scale * 100) + '%';
        renderAllPages();
    } else if (documentType === DocumentType.EPUB && epubRendition) {
        epubFontSize = 120;
        epubRendition.themes.fontSize('120%');
        zoomLevel.textContent = '120%';
    } else if (documentType === DocumentType.TEXT && textContainer) {
        textZoom = 1.25;
        applyTextZoom();
        zoomLevel.textContent = Math.round(textZoom * 100) + '%';
    }
}

async function fitToPage() {
    if (documentType === DocumentType.PDF && pdfDocument) {
        const containerWidth = pdfContainer.clientWidth - 40;
        const containerHeight = pdfContainer.clientHeight - 40;
        const page = await pdfDocument.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const scaleWidth = containerWidth / viewport.width;
        const scaleHeight = containerHeight / viewport.height;
        scale = Math.min(scaleWidth, scaleHeight);
        zoomLevel.textContent = Math.round(scale * 100) + '%';
        renderAllPages();
    } else if (documentType === DocumentType.EPUB && epubRendition) {
        epubFontSize = 90;
        epubRendition.themes.fontSize('90%');
        zoomLevel.textContent = '90%';
    } else if (documentType === DocumentType.TEXT && textContainer) {
        textZoom = 1;
        applyTextZoom();
        zoomLevel.textContent = '100%';
    }
}

// Track current page while scrolling
pdfContainer.addEventListener('scroll', () => {
    if (documentType === DocumentType.TEXT) {
        return;
    }

    const pages = documentType === DocumentType.PDF
        ? pdfContainer.querySelectorAll('.pdf-page')
        : pdfContainer.querySelectorAll('.epub-page');

    const containerRect = pdfContainer.getBoundingClientRect();

    pages.forEach((page, index) => {
        const pageRect = page.getBoundingClientRect();
        const isVisible = pageRect.top < containerRect.bottom && pageRect.bottom > containerRect.top;

        if (isVisible && pageRect.top >= containerRect.top - 100) {
            const newPage = index + 1;
            if (newPage !== currentPage) {
                currentPage = newPage;
                pageInput.value = currentPage;
                updatePageInfo();
            }
        }
    });
});

// Reset app
function resetApp() {
    if (epubRendition) {
        epubRendition.destroy();
        epubRendition = null;
    }

    documentType = null;
    pdfDocument = null;
    epubBook = null;
    epubSpineItems = [];
    epubHrefToIndex = {};
    currentPage = 1;
    pdfText = '';
    pdfPageTexts = {};
    scale = 1.5;
    epubFontSize = 100;
    selectedText = '';
    textZoom = 1;
    conversationHistory = []; // Clear conversation history on new document

    pdfContainer.innerHTML = '';
    epubContainer.innerHTML = '';
    pdfContainer.style.display = 'none';
    epubContainer.style.display = 'none';
    if (textContainer) {
        textContainer.textContent = '';
        textContainer.style.display = 'none';
        textContainer.style.fontSize = '16px';
        textContainer.style.lineHeight = '1.6';
    }
    pdfViewer.classList.remove('is-epub');

    if (pdfSection && chatSidebar) {
        pdfSection.style.flexBasis = '';
        chatSidebar.style.flexBasis = '';
    }

    uploadArea.style.display = 'flex';
    pdfViewer.style.display = 'none';
    fileInput.value = '';
    chatMessages.innerHTML = '<div class="welcome-message"><p>👋 Upload a document to start chatting!</p></div>';
    chatInput.disabled = true;
    sendBtn.disabled = true;
    chatInput.value = '';
    zoomLevel.textContent = '100%';
    pageInput.value = 1;
    pageTotal.textContent = '/ 1';
    updatePageInfo();
}

// Add message to chat
function addMessageToChat(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Render markdown for assistant messages
    if (role === 'assistant') {
        // Parse markdown
        let html = marked.parse(content);

        // Render LaTeX if present
        html = renderLatex(html);

        contentDiv.innerHTML = html;

        // Apply syntax highlighting to code blocks
        contentDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);

            // Wrap code block with header and copy button
            const pre = block.parentElement;
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            const header = document.createElement('div');
            header.className = 'code-block-header';

            // Detect language
            const language = block.className.split('language-')[1] || 'text';
            const langSpan = document.createElement('span');
            langSpan.className = 'code-language';
            langSpan.textContent = language;

            // Create copy button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-code-btn';
            copyBtn.innerHTML = '📋 Copy';
            copyBtn.onclick = () => copyCode(copyBtn, block.textContent);

            header.appendChild(langSpan);
            header.appendChild(copyBtn);

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
        });
    } else {
        contentDiv.textContent = content;
    }

    messageDiv.appendChild(contentDiv);
    if (role === 'assistant') {
        attachExportButton(messageDiv, content);
    } else if (role === 'user') {
        attachEditButton(messageDiv, content);
    }
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Render LaTeX in text
function renderLatex(html) {
    // Inline LaTeX: $...$
    html = html.replace(/\$([^\$]+)\$/g, (match, latex) => {
        try {
            return katex.renderToString(latex, { throwOnError: false });
        } catch (e) {
            return match;
        }
    });

    // Display LaTeX: $$...$$
    html = html.replace(/\$\$([^\$]+)\$\$/g, (match, latex) => {
        try {
            return katex.renderToString(latex, { throwOnError: false, displayMode: true });
        } catch (e) {
            return match;
        }
    });

    return html;
}

// Copy code to clipboard
async function copyCode(button, code) {
    try {
        await navigator.clipboard.writeText(code);
        button.innerHTML = '✓ Copied!';
        button.classList.add('copied');
        setTimeout(() => {
            button.innerHTML = '📋 Copy';
            button.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy code:', err);
    }
}

function attachExportButton(messageDiv, markdown) {
    if (!messageDiv || typeof markdown !== 'string' || markdown.trim().length === 0) {
        return;
    }

    messageDiv.dataset.rawMarkdown = markdown;

    let actions = messageDiv.querySelector('.message-actions');
    if (!actions) {
        actions = document.createElement('div');
        actions.className = 'message-actions';
        messageDiv.appendChild(actions);
    }

    let exportBtn = actions.querySelector('.export-md-btn');
    if (!exportBtn) {
        exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'message-action-btn export-md-btn';
        exportBtn.textContent = 'Save .md';
        actions.appendChild(exportBtn);
    }

    exportBtn.onclick = () => downloadMarkdown(markdown);
}

function attachEditButton(messageDiv, originalContent) {
    if (!messageDiv || typeof originalContent !== 'string' || originalContent.trim().length === 0) {
        return;
    }

    messageDiv.dataset.originalContent = originalContent;

    let actions = messageDiv.querySelector('.message-actions');
    if (!actions) {
        actions = document.createElement('div');
        actions.className = 'message-actions';
        messageDiv.appendChild(actions);
    }

    let editBtn = actions.querySelector('.edit-msg-btn');
    if (!editBtn) {
        editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'message-action-btn edit-msg-btn';
        editBtn.textContent = 'Edit';
        actions.appendChild(editBtn);
    }

    editBtn.onclick = () => editUserMessage(messageDiv, originalContent);
}

function editUserMessage(messageDiv, originalContent) {
    // Find the index of this message in the chat
    const allMessages = Array.from(chatMessages.querySelectorAll('.message'));
    const messageIndex = allMessages.indexOf(messageDiv);

    if (messageIndex === -1) return;

    // Populate the input with the original message
    chatInput.value = originalContent;
    chatInput.focus();

    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';

    // Remove all messages from this point onwards (user message + all subsequent messages)
    const messagesToRemove = allMessages.slice(messageIndex);
    messagesToRemove.forEach(msg => msg.remove());

    // Update conversation history - remove from this point onwards
    // Find the corresponding position in conversation history
    let historyIndex = 0;
    for (let i = 0; i < allMessages.length && i < messageIndex; i++) {
        const msg = allMessages[i];
        if (msg.classList.contains('message-user') || msg.classList.contains('message-assistant')) {
            historyIndex++;
        }
    }

    // Truncate conversation history
    if (historyIndex < conversationHistory.length) {
        conversationHistory = conversationHistory.slice(0, historyIndex);
    }
}

function downloadMarkdown(markdown) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const filename = `assistant-response-${timestamp}.md`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function stopCurrentStream() {
    if (!currentStream || currentStream.aborted) {
        return;
    }

    currentStream.aborted = true;

    if (stopStreamBtn) {
        stopStreamBtn.disabled = true;
        stopStreamBtn.classList.add('is-stopping');
    }

    try {
        currentStream.controller?.abort();
    } catch (abortError) {
        console.warn('Failed to abort stream:', abortError);
    }
}

function cleanupStreamingState() {
    if (stopStreamBtn) {
        stopStreamBtn.style.display = 'none';
        stopStreamBtn.disabled = false;
        stopStreamBtn.classList.remove('is-stopping');
    }
    currentStream = null;
}

function markMessageAsStopped(messageDiv) {
    if (!messageDiv) return;

    messageDiv.classList.add('message-stopped');

    const contentDiv = messageDiv.querySelector('.message-content');
    if (!contentDiv) return;

    if (!contentDiv.querySelector('.message-stop-notice')) {
        const notice = document.createElement('div');
        notice.className = 'message-stop-notice';
        notice.textContent = 'Response stopped by user';
        contentDiv.appendChild(notice);
    }
}

// Reset chat
function resetChat() {
    if (confirm('Clear all chat messages?')) {
        chatMessages.innerHTML = '';
        conversationHistory = []; // Clear conversation history
        addMessageToChat('assistant', 'Chat cleared! What would you like to know about the document?');
    }
}

// Add loading indicator
function addLoadingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-loading';
    messageDiv.id = 'loading-indicator';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';

    contentDiv.appendChild(typingDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Remove loading indicator
function removeLoadingIndicator() {
    const loading = document.getElementById('loading-indicator');
    if (loading) loading.remove();
}

// Send message with streaming
async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    // Add user message to chat
    addMessageToChat('user', message);
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Disable input while processing
    chatInput.disabled = true;
    sendBtn.disabled = true;

    // Add loading indicator
    addLoadingIndicator();

    let messageDiv = null;
    let fullText = '';
    let streamState = null;
    let streamAbortedByUser = false;
    let abortHandled = false;

    const controller = new AbortController();
    streamState = { controller, aborted: false, messageDiv: null };
    currentStream = streamState;

    try {
        // Get smart context around current page
        const smartContext = getSmartContext(currentPage);
        const totalPages = getTotalPages();
        const startPage = smartContext.pages[0] ?? currentPage;
        const endPage = smartContext.pages.length > 0
            ? smartContext.pages[smartContext.pages.length - 1]
            : currentPage;
        const useSmartContext = smartContext.text && smartContext.text.trim().length > 0;
        const contextText = useSmartContext ? smartContext.text : pdfText;
        const estimatedTokens = useSmartContext
            ? smartContext.tokens
            : estimateTokens(contextText);

        console.log(`📄 Smart Context: Using segments ${startPage}-${endPage} (${smartContext.pages.length}/${totalPages} segments, ~${estimatedTokens.toLocaleString()} tokens)`);

        // Call our local API server with streaming
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: buildRequestHeaders(),
            signal: controller.signal,
            body: JSON.stringify({
                message: message,
                pdfText: contextText,
                conversationHistory: conversationHistory, // Send conversation history
                contextInfo: {
                    currentPage: currentPage,
                    totalPages: totalPages,
                    includedPages: smartContext.pages,
                    estimatedTokens: estimatedTokens
                }
            })
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = await response.text();
            }
            console.error('API Error:', errorData);
            throw new Error(errorData.error || errorData || `API error: ${response.status}`);
        }

        // Check if response is streaming or JSON
        const contentType = response.headers.get('content-type');
        console.log('Response content-type:', contentType);
        console.log('Response status:', response.status);

        // Handle non-streaming (fallback) response
        if (!contentType || !contentType.includes('text/event-stream')) {
            console.warn('⚠️ Received non-streaming response, using fallback mode');

            const data = await response.json();
            const assistantMessage = data.content[0].text;

            // Remove loading and add response
            removeLoadingIndicator();
            addMessageToChat('assistant', assistantMessage);
            cleanupStreamingState();

            // Re-enable input
            chatInput.disabled = false;
            sendBtn.disabled = false;
            chatInput.focus();
            return;
        }

        // Remove loading indicator and prepare for streaming
        removeLoadingIndicator();
        console.log('✅ Streaming response detected!');

        // Create a message container for streaming
        messageDiv = createStreamingMessageContainer();
        fullText = '';
        streamState.messageDiv = messageDiv;

        if (stopStreamBtn) {
            stopStreamBtn.style.display = 'flex';
            stopStreamBtn.disabled = false;
            stopStreamBtn.classList.remove('is-stopping');
        }

        console.log('Starting to read stream...');

        // Read the stream
        const reader = response.body.getReader();
        streamState.reader = reader;
        const decoder = new TextDecoder();
        let chunkCount = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    console.log('Stream reading complete');
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);

                        if (data === '[DONE]') {
                            console.log('Received [DONE] signal. Final text length:', fullText.length);
                            // Finalize the message
                            finalizeStreamingMessage(messageDiv, fullText);
                            break;
                        }

                        try {
                            const parsed = JSON.parse(data);

                            // Handle content_block_delta events
                            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                                fullText += parsed.delta.text;
                                chunkCount++;
                                updateStreamingMessage(messageDiv, fullText);
                            }
                        } catch (e) {
                            console.warn('Failed to parse chunk:', data.substring(0, 100));
                        }
                    }
                }
            }

            console.log(`Stream complete. Received ${chunkCount} text chunks`);

            if (messageDiv.classList.contains('message-streaming')) {
                if (fullText.trim().length > 0) {
                    finalizeStreamingMessage(messageDiv, fullText);
                } else {
                    messageDiv.classList.remove('message-streaming');
                }
            }

        } catch (streamError) {
            if (streamState.aborted) {
                streamAbortedByUser = true;
                abortHandled = true;
                console.info('Stream stopped by user');

                if (fullText.trim().length > 0) {
                    finalizeStreamingMessage(messageDiv, fullText);
                } else {
                    messageDiv.classList.remove('message-streaming');
                    const contentDiv = messageDiv.querySelector('.message-content');
                    if (contentDiv) {
                        contentDiv.innerHTML = '';
                    }
                }

                markMessageAsStopped(messageDiv);
            } else {
                console.error('Error reading stream:', streamError);
                throw streamError;
            }
        }

        // Add to conversation history
        conversationHistory.push({
            role: 'user',
            content: message
        });

        const trimmed = fullText.trim();
        const assistantContent = trimmed.length > 0
            ? fullText
            : streamState.aborted
                ? '[Response stopped by user]'
                : '';

        conversationHistory.push({
            role: 'assistant',
            content: assistantContent
        });

        if (streamState.aborted && !abortHandled) {
            markMessageAsStopped(messageDiv);
            abortHandled = true;
        }

    } catch (error) {
        if (currentStream && currentStream.aborted) {
            streamAbortedByUser = true;
        }

        if (streamAbortedByUser || error.name === 'AbortError') {
            console.info('Request aborted by user');
            if (!abortHandled) {
                removeLoadingIndicator();
                if (messageDiv) {
                    if (messageDiv.classList.contains('message-streaming')) {
                        messageDiv.classList.remove('message-streaming');
                        const contentDiv = messageDiv.querySelector('.message-content');
                        if (contentDiv) {
                            contentDiv.innerHTML = '';
                        }
                    }
                    markMessageAsStopped(messageDiv);
                } else {
                    addMessageToChat('assistant', 'Response stopped by user.');
                }
                abortHandled = true;
            }
        } else {
            console.error('Error calling Claude API:', error);
            removeLoadingIndicator();
            addMessageToChat('assistant', 'Sorry, I encountered an error processing your request. Please try again.');
        }
    } finally {
        cleanupStreamingState();
        // Re-enable input
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

// Streaming message functions
function createStreamingMessageContainer() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-assistant message-streaming';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Add a blinking cursor
    const cursorSpan = document.createElement('span');
    cursorSpan.className = 'streaming-cursor';
    cursorSpan.textContent = '▋';
    contentDiv.appendChild(cursorSpan);

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return messageDiv;
}

function updateStreamingMessage(messageDiv, text) {
    const contentDiv = messageDiv.querySelector('.message-content');

    // Check if user is near the bottom before updating (with 100px threshold)
    const isNearBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 100;

    // Parse markdown in real-time (but don't apply syntax highlighting yet)
    let html = marked.parse(text);
    html = renderLatex(html);

    // Add cursor at the end
    html += '<span class="streaming-cursor">▋</span>';

    contentDiv.innerHTML = html;

    // Only auto-scroll if user was already near the bottom
    if (isNearBottom) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function finalizeStreamingMessage(messageDiv, text) {
    const contentDiv = messageDiv.querySelector('.message-content');

    // Remove streaming class
    messageDiv.classList.remove('message-streaming');

    // Parse markdown with full formatting
    let html = marked.parse(text);
    html = renderLatex(html);

    contentDiv.innerHTML = html;

    // Apply syntax highlighting to code blocks
    contentDiv.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);

        // Wrap code block with header and copy button
        const pre = block.parentElement;
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';

        const header = document.createElement('div');
        header.className = 'code-block-header';

        // Detect language
        const language = block.className.split('language-')[1] || 'text';
        const langSpan = document.createElement('span');
        langSpan.className = 'code-language';
        langSpan.textContent = language;

        // Create copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-code-btn';
        copyBtn.innerHTML = '📋 Copy';
        copyBtn.onclick = () => copyCode(copyBtn, block.textContent);

        header.appendChild(langSpan);
        header.appendChild(copyBtn);

        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);
    });

    attachExportButton(messageDiv, text);

    // Final auto-scroll
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Chat font size controls
function increaseChatFontSize() {
    if (chatFontSize < 24) {
        chatFontSize += 2;
        applyChatFontSize();
    }
}

function decreaseChatFontSize() {
    if (chatFontSize > 10) {
        chatFontSize -= 2;
        applyChatFontSize();
    }
}

function applyChatFontSize() {
    // Apply to message content
    const style = document.documentElement.style;
    style.setProperty('--chat-font-size', `${chatFontSize}px`);

    // Update label with visual feedback
    updateFontSizeLabel();

    // Save preference to localStorage
    localStorage.setItem('chatFontSize', chatFontSize);
}

function updateFontSizeLabel() {
    const sizes = {
        10: 'A',
        12: 'Aa',
        14: 'Aa',
        16: 'Aa',
        18: 'AA',
        20: 'AA',
        22: 'AA',
        24: 'AA'
    };

    fontSizeLabel.textContent = sizes[chatFontSize] || 'Aa';
    fontSizeLabel.style.fontSize = `${Math.min(chatFontSize + 2, 18)}px`;

    // Animate the label
    fontSizeLabel.style.transform = 'scale(1.2)';
    setTimeout(() => {
        fontSizeLabel.style.transform = 'scale(1)';
    }, 200);
}

function hideApiKeyModal() {
    if (!apiKeyModal) return;
    apiKeyModal.classList.add('hidden');
    if (apiKeyInput) {
        apiKeyInput.blur();
    }
}

function updateApiKeyStatus() {
    if (!apiKeyStatus) return;

    if (userApiKey) {
        apiKeyStatus.textContent = 'Set';
        apiKeyStatus.classList.add('set');
    } else {
        apiKeyStatus.textContent = 'Not set';
        apiKeyStatus.classList.remove('set');
    }
}

function loadStoredApiKey() {
    try {
        const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
        userApiKey = stored || '';
    } catch (storageError) {
        console.error('Failed to load stored API key:', storageError);
        userApiKey = '';
    }
    updateApiKeyStatus();
}

function buildRequestHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (userApiKey) {
        headers['x-api-key'] = userApiKey;
    }

    return headers;
}

// Load saved font size on startup
function loadChatFontSize() {
    const saved = localStorage.getItem('chatFontSize');
    if (saved) {
        chatFontSize = parseInt(saved, 10);
        applyChatFontSize();
    } else {
        applyChatFontSize();
    }
}

// Initialize font size
loadChatFontSize();
loadStoredApiKey();

// Make internal links clickable for navigation
function makeLinksClickable(container, currentChapter) {
    const links = container.querySelectorAll('a[href]');

    links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;

        link.addEventListener('click', (e) => {
            e.preventDefault();

            // Handle internal anchors (e.g., #section-1)
            if (href.startsWith('#')) {
                const targetId = href.substring(1);

                // First try to find the anchor in the current chapter
                let targetElement = container.querySelector(`[id="${targetId}"], [name="${targetId}"]`);

                // If not found, search all EPUB pages
                if (!targetElement) {
                    const allPages = pdfContainer.querySelectorAll('.epub-page, .pdf-page');
                    for (const page of allPages) {
                        targetElement = page.querySelector(`[id="${targetId}"], [name="${targetId}"]`);
                        if (targetElement) break;
                    }
                }

                // Scroll to the target element
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    console.warn('Target anchor not found:', targetId);
                }
            }
            // Handle internal chapter links (e.g., chapter2.html#intro)
            else if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('mailto:')) {
                const [chapterPath, anchor] = href.split('#');

                // Try to find the chapter by matching href
                let targetChapterIndex = -1;

                for (const [chapterHref, index] of Object.entries(epubHrefToIndex)) {
                    if (chapterHref.includes(chapterPath) || chapterPath.includes(chapterHref)) {
                        targetChapterIndex = index;
                        break;
                    }
                }

                if (targetChapterIndex >= 0) {
                    const targetPage = targetChapterIndex + 1;
                    goToPage(targetPage);

                    // If there's an anchor, scroll to it after navigation
                    if (anchor) {
                        setTimeout(() => {
                            const targetPageElement = document.getElementById(`page-${targetPage}`);
                            if (targetPageElement) {
                                const targetAnchor = targetPageElement.querySelector(`[id="${anchor}"], [name="${anchor}"]`);
                                if (targetAnchor) {
                                    targetAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                            }
                        }, 300);
                    }
                } else {
                    console.warn('Target chapter not found:', chapterPath);
                }
            }
            // External links - open in new tab
            else if (href.startsWith('http://') || href.startsWith('https://')) {
                window.open(href, '_blank', 'noopener,noreferrer');
            }
        });

        // Add visual indicator for internal links
        if (href.startsWith('#') || (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('mailto:'))) {
            link.style.cursor = 'pointer';
            link.title = 'Jump to section';
        }
    });
}

// Text selection and context menu functions
function handleTextSelection(event) {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0) {
        // Check if selection is within a text layer or epub content
        let node = selection.anchorNode;
        while (node && node !== document) {
            if (node.classList && (node.classList.contains('textLayer') || node.classList.contains('epub-content') || node.classList.contains('text-container'))) {
                selectedText = text;
                showContextMenu(event.pageX, event.pageY);
                return;
            }
            node = node.parentNode;
        }
    }

    contextMenu.style.display = 'none';
}

function showContextMenu(x, y) {
    contextMenu.style.display = 'block';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
}

async function copySelectedText() {
    try {
        await navigator.clipboard.writeText(selectedText);
        contextMenu.style.display = 'none';
    } catch (err) {
        console.error('Failed to copy text:', err);
        alert('Failed to copy text to clipboard');
    }
}

async function explainSelectedText() {
    contextMenu.style.display = 'none';
    chatInput.value = `Explain this from the document: "${selectedText}"`;
    chatInput.focus();
    await sendMessage();
}

function sendSelectedTextToChat() {
    contextMenu.style.display = 'none';
    chatInput.value = selectedText;
    chatInput.focus();
    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
}
