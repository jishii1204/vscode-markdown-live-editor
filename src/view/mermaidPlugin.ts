import type { Node } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

let idCounter = 0;

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
	dom.setAttribute('data-language', node.attrs.language || '');
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
