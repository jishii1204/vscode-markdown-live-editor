import type { Node } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
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

function applyHighlight(codeEl: HTMLElement, language: string): void {
	loadHljs().then(() => {
		if (!hljs) return;
		// Remove previous highlighting (collect first to avoid mutating during iteration)
		const toRemove = Array.from(codeEl.classList).filter(
			(cls) => cls.startsWith('hljs') || cls.startsWith('language-'),
		);
		for (const cls of toRemove) {
			codeEl.classList.remove(cls);
		}
		if (language && hljs.getLanguage(language)) {
			codeEl.classList.add(`language-${language}`);
			hljs.highlightElement(codeEl);
		} else if (codeEl.textContent?.trim()) {
			// Auto-detect from registered languages
			const result = hljs.highlightAuto(codeEl.textContent);
			codeEl.innerHTML = result.value;
		}
	});
}

// Lazy-loaded mermaid reference
let mermaidModule: typeof import('mermaid') | null = null;
let mermaidLoading: Promise<void> | null = null;

async function loadMermaid(): Promise<void> {
	if (mermaidModule) return;
	if (mermaidLoading) {
		await mermaidLoading;
		return;
	}
	mermaidLoading = (async () => {
		try {
			mermaidModule = await import('mermaid');
			const isDark =
				document.body.classList.contains('vscode-dark') ||
				document.body.classList.contains('vscode-high-contrast');
			mermaidModule.default.initialize({
				startOnLoad: false,
				theme: isDark ? 'dark' : 'default',
				securityLevel: 'loose',
			});
		} catch (e) {
			console.error('[mermaid] load failed:', e);
			mermaidModule = null;
		}
	})();
	await mermaidLoading;
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
	if (!mermaidModule) {
		container.innerHTML =
			'<div class="mermaid-error">Failed to load mermaid</div>';
		return;
	}

	try {
		const id = `mermaid-svg-${++idCounter}`;
		const { svg } = await mermaidModule.default.render(id, trimmed);
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
	dom.classList.add('hljs');
	const code = document.createElement('code');
	dom.appendChild(code);

	// Schedule initial highlighting after ProseMirror populates the content
	let currentLanguage = language;
	requestAnimationFrame(() => {
		if (code.textContent?.trim()) {
			applyHighlight(code, currentLanguage);
		}
	});

	return {
		dom,
		contentDOM: code,
		update(updatedNode: Node): boolean {
			if (updatedNode.type.name !== 'code_block') return false;
			if (updatedNode.attrs.language === 'mermaid') return false;
			const newLang = updatedNode.attrs.language || '';
			dom.setAttribute('data-language', newLang);
			currentLanguage = newLang;
			// Re-highlight on content or language change
			requestAnimationFrame(() => {
				applyHighlight(code, currentLanguage);
			});
			return true;
		},
		ignoreMutation(mutation: {
			type: string;
			target: globalThis.Node;
		}): boolean {
			// Ignore highlight.js span insertions (childList mutations)
			if (mutation.type === 'childList') {
				return true;
			}
			return false;
		},
	};
}

/**
 * Milkdown plugin: ProseMirror plugin with nodeViews for mermaid code blocks.
 */
export const mermaidPlugin = $prose(() => {
	return new Plugin({
		key: new PluginKey('mermaid-nodeview'),
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
