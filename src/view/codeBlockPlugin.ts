import type { Node } from '@milkdown/prose/model';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import type { HLJSApi } from 'highlight.js';

let idCounter = 0;

// Lazy-loaded highlight.js reference (core + selected languages only)
let hljs: HLJSApi | null = null;
let hljsLoading: Promise<void> | null = null;

async function loadHljs(): Promise<void> {
	if (hljs) return;
	if (hljsLoading) {
		await hljsLoading;
		return;
	}
	hljsLoading = (async () => {
		try {
			hljs = (await import('./hljs')).default;
		} catch (e) {
			console.error('[hljs] load failed:', e);
			hljs = null;
		}
	})();
	await hljsLoading;
}

// ============================================
// Highlight.js → ProseMirror Decoration bridge
// ============================================

const HLJS_LOADED_META = 'hljs-loaded';

/**
 * Parse highlight.js HTML output into text offset ranges with CSS classes.
 * Does NOT modify the DOM — purely string parsing.
 *
 * Input:  '<span class="hljs-keyword">const</span> x = <span class="hljs-number">1</span>'
 * Output: [{ from: 0, to: 5, cls: 'hljs-keyword' }, { from: 10, to: 11, cls: 'hljs-number' }]
 */
function parseHighlightHtml(
	html: string,
): Array<{ from: number; to: number; cls: string }> {
	const ranges: Array<{ from: number; to: number; cls: string }> = [];
	const classStack: string[] = [];
	let offset = 0;
	let i = 0;

	while (i < html.length) {
		if (html[i] === '<') {
			if (html.startsWith('</span>', i)) {
				classStack.pop();
				i += 7;
			} else if (html.startsWith('<span class="', i)) {
				const classStart = i + 13;
				const classEnd = html.indexOf('"', classStart);
				classStack.push(html.substring(classStart, classEnd));
				i = classEnd + 2; // skip '">'
			} else {
				// Skip unknown tags
				const tagEnd = html.indexOf('>', i);
				i = tagEnd === -1 ? html.length : tagEnd + 1;
			}
		} else {
			// Text content — find next tag
			const nextTag = html.indexOf('<', i);
			const raw =
				nextTag === -1 ? html.substring(i) : html.substring(i, nextTag);

			// Decode HTML entities that highlight.js escapes
			const text = raw
				.replace(/&amp;/g, '&')
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&quot;/g, '"')
				.replace(/&#x27;/g, "'");

			if (classStack.length > 0 && text.length > 0) {
				ranges.push({
					from: offset,
					to: offset + text.length,
					cls: classStack[classStack.length - 1],
				});
			}
			offset += text.length;
			i = nextTag === -1 ? html.length : nextTag;
		}
	}

	return ranges;
}

function buildHighlightDecorations(state: EditorState): DecorationSet {
	if (!hljs) return DecorationSet.empty;
	const h = hljs;

	const decorations: Decoration[] = [];

	state.doc.descendants((node, pos) => {
		if (node.type.name !== 'code_block') return;
		if (node.attrs.language === 'mermaid') return;

		const language = node.attrs.language || '';
		const code = node.textContent;
		if (!code.trim()) return;

		// Position of text content inside code_block (node pos + 1)
		const textStart = pos + 1;

		try {
			let highlighted: string;
			if (language && h.getLanguage(language)) {
				highlighted = h.highlight(code, { language }).value;
			} else {
				// Skip blocks with unknown or no language
				return;
			}

			const ranges = parseHighlightHtml(highlighted);
			for (const range of ranges) {
				decorations.push(
					Decoration.inline(textStart + range.from, textStart + range.to, {
						class: range.cls,
					}),
				);
			}
		} catch {
			// Skip highlighting on error
		}
	});

	return DecorationSet.create(state.doc, decorations);
}

/**
 * Milkdown plugin: ProseMirror Decoration-based syntax highlighting.
 * Uses highlight.js to tokenize, then creates ProseMirror Decorations
 * instead of modifying contentDOM (which breaks cursor/editing).
 */
export const highlightPlugin = $prose(() => {
	const key = new PluginKey<DecorationSet>('hljs-highlight');

	return new Plugin({
		key,
		state: {
			init: (_config, state) => buildHighlightDecorations(state),
			apply: (tr: Transaction, prev: DecorationSet, _oldState, newState) => {
				if (tr.docChanged || tr.getMeta(HLJS_LOADED_META)) {
					return buildHighlightDecorations(newState);
				}
				return prev;
			},
		},
		props: {
			decorations(state) {
				return key.getState(state) ?? DecorationSet.empty;
			},
		},
		view(editorView) {
			let destroyed = false;
			loadHljs().then(() => {
				if (!destroyed && hljs) {
					const { tr } = editorView.state;
					editorView.dispatch(tr.setMeta(HLJS_LOADED_META, true));
				}
			});
			return {
				destroy() {
					destroyed = true;
				},
			};
		},
	});
});

// ============================================
// Mermaid code block nodeView
// ============================================

// Type for the mermaid API surface we use
interface MermaidLike {
	initialize(config: Record<string, unknown>): void;
	render(id: string, code: string): Promise<{ svg: string }>;
}

// Lazy-loaded mermaid reference (loaded from separate bundle via <script> tag)
let mermaidApi: MermaidLike | null = null;
let mermaidLoading: Promise<void> | null = null;

function getMermaidGlobal(): MermaidLike | null {
	return (window as unknown as Record<string, unknown>)
		.__mermaid as MermaidLike | null;
}

async function loadMermaid(): Promise<void> {
	if (mermaidApi) return;
	if (mermaidLoading) {
		await mermaidLoading;
		return;
	}
	mermaidLoading = new Promise<void>((resolve) => {
		// Check if already loaded by another call
		const existing = getMermaidGlobal();
		if (existing) {
			mermaidApi = existing;
			initMermaid();
			resolve();
			return;
		}

		const uri = document
			.getElementById('editor')
			?.getAttribute('data-mermaid-uri');
		if (!uri) {
			console.error('[mermaid] no mermaid URI found');
			resolve();
			return;
		}

		const script = document.createElement('script');
		script.src = uri;
		script.onload = () => {
			mermaidApi = getMermaidGlobal();
			if (mermaidApi) {
				initMermaid();
			} else {
				console.error('[mermaid] global not found after script load');
			}
			resolve();
		};
		script.onerror = () => {
			console.error('[mermaid] failed to load mermaid script');
			resolve();
		};
		document.head.appendChild(script);
	});
	await mermaidLoading;
}

function initMermaid(): void {
	if (!mermaidApi) return;
	const isDark =
		document.body.classList.contains('vscode-dark') ||
		document.body.classList.contains('vscode-high-contrast');
	mermaidApi.initialize({
		startOnLoad: false,
		theme: isDark ? 'dark' : 'default',
		securityLevel: 'loose',
	});
}

async function renderMermaidSvg(
	code: string,
	container: HTMLElement,
): Promise<void> {
	const trimmed = code.trim();
	if (!trimmed) {
		container.innerHTML =
			'<div class="mermaid-placeholder">Empty mermaid block</div>';
		return;
	}

	// Skip if already rendered with the same code
	if (container.getAttribute('data-source') === trimmed) return;

	await loadMermaid();
	if (!mermaidApi) {
		container.innerHTML =
			'<div class="mermaid-error">Failed to load mermaid</div>';
		return;
	}

	try {
		const id = `mermaid-svg-${++idCounter}`;
		const { svg } = await mermaidApi.render(id, trimmed);
		container.setAttribute('data-source', trimmed);
		container.innerHTML = svg;
	} catch {
		container.setAttribute('data-source', trimmed);
		container.innerHTML =
			'<div class="mermaid-error">Mermaid syntax error</div>';
	}
}

function createMermaidView(node: Node) {
	const dom = document.createElement('div');
	dom.className = 'mermaid-block';

	const pre = document.createElement('pre');
	pre.className = 'mermaid-code';
	pre.setAttribute('data-language', 'mermaid');
	const code = document.createElement('code');
	pre.appendChild(code);

	const preview = document.createElement('div');
	preview.className = 'mermaid-preview';
	preview.textContent = 'Loading diagram...';

	dom.appendChild(pre);
	dom.appendChild(preview);

	// Render asynchronously
	renderMermaidSvg(node.textContent, preview);

	preview.addEventListener('click', () => {
		pre.classList.toggle('mermaid-code--visible');
	});

	return {
		dom,
		contentDOM: code,

		update(updatedNode: Node): boolean {
			if (updatedNode.type.name !== 'code_block') return false;
			if (updatedNode.attrs.language !== 'mermaid') return false;
			// Only re-render if content actually changed
			renderMermaidSvg(updatedNode.textContent, preview);
			return true;
		},

		// CRITICAL: Tell ProseMirror to ignore DOM mutations inside
		// the preview area. Without this, inserting SVG causes
		// ProseMirror to think the content changed and recreate the
		// nodeView in an infinite loop.
		ignoreMutation(mutation: {
			type: string;
			target: globalThis.Node;
		}): boolean {
			// Always ignore mutations outside contentDOM (i.e. in preview)
			if (!code.contains(mutation.target)) return true;
			return false;
		},

		stopEvent(): boolean {
			return false;
		},

		destroy() {},
	};
}

function createDefaultCodeBlockView(node: Node) {
	const dom = document.createElement('pre');
	const language = node.attrs.language || '';
	dom.setAttribute('data-language', language);
	const code = document.createElement('code');
	dom.appendChild(code);

	return {
		dom,
		contentDOM: code,
		update(updatedNode: Node): boolean {
			if (updatedNode.type.name !== 'code_block') return false;
			if (updatedNode.attrs.language === 'mermaid') return false;
			dom.setAttribute('data-language', updatedNode.attrs.language || '');
			return true;
		},
	};
}

/**
 * Milkdown plugin: ProseMirror plugin with nodeViews for code blocks.
 * Mermaid blocks get a special preview nodeView; others get a simple
 * nodeView (highlighting is handled by highlightPlugin via Decorations).
 */
export const codeBlockPlugin = $prose(() => {
	return new Plugin({
		key: new PluginKey('code-block-nodeview'),
		props: {
			nodeViews: {
				code_block: (node, _view, _getPos) => {
					if (node.attrs.language === 'mermaid') {
						return createMermaidView(node);
					}
					return createDefaultCodeBlockView(node);
				},
			},
		},
	});
});
