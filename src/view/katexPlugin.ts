import type { Node } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $nodeSchema, $prose, $remark } from '@milkdown/utils';
import remarkMath from 'remark-math';

// ---------------------------------------------------------------------------
// Lazy-loaded KaTeX
// ---------------------------------------------------------------------------
let katexModule: typeof import('katex') | null = null;
let katexLoading: Promise<void> | null = null;

async function loadKatex(): Promise<void> {
	if (katexModule) return;
	if (katexLoading) {
		await katexLoading;
		return;
	}
	katexLoading = (async () => {
		try {
			katexModule = await import('katex');
		} catch (e) {
			console.error('[katex] load failed:', e);
			katexModule = null;
		}
	})();
	await katexLoading;
}

function renderKatex(
	container: HTMLElement,
	value: string,
	displayMode: boolean,
): void {
	loadKatex().then(() => {
		if (!katexModule) {
			container.textContent = value;
			return;
		}
		try {
			katexModule.default.render(value, container, {
				throwOnError: false,
				displayMode,
			});
		} catch {
			container.textContent = value;
		}
	});
}

// ---------------------------------------------------------------------------
// remark-math: parse $...$ and $$...$$ syntax
// ---------------------------------------------------------------------------
export const remarkMathPlugin = $remark('remarkMath', () => remarkMath);

// ---------------------------------------------------------------------------
// Inline math schema: $E=mc^2$
// ---------------------------------------------------------------------------
export const mathInlineSchema = $nodeSchema('math_inline', () => ({
	inline: true,
	group: 'inline',
	atom: true,
	selectable: true,
	marks: '',
	attrs: {
		value: { default: '' },
	},
	parseDOM: [
		{
			tag: 'span[data-math-type="inline"]',
			getAttrs: (dom) => {
				if (!(dom instanceof HTMLElement)) return null;
				return {
					value: dom.getAttribute('data-value') || '',
				};
			},
		},
	],
	toDOM: (node) => [
		'span',
		{
			class: 'math-inline',
			'data-math-type': 'inline',
			'data-value': node.attrs.value,
		},
		`$${node.attrs.value}$`,
	],
	parseMarkdown: {
		match: (node) => node.type === 'inlineMath',
		runner: (state, node, type) => {
			state.addNode(type, { value: (node.value as string) || '' });
		},
	},
	toMarkdown: {
		match: (node) => node.type.name === 'math_inline',
		runner: (state, node) => {
			state.addNode('inlineMath', undefined, node.attrs.value);
		},
	},
}));

// ---------------------------------------------------------------------------
// Block math schema: $$...$$
// ---------------------------------------------------------------------------
export const mathDisplaySchema = $nodeSchema('math_display', () => ({
	group: 'block',
	atom: true,
	defining: true,
	selectable: true,
	attrs: {
		value: { default: '' },
	},
	parseDOM: [
		{
			tag: 'div[data-math-type="block"]',
			getAttrs: (dom) => {
				if (!(dom instanceof HTMLElement)) return null;
				return {
					value: dom.getAttribute('data-value') || '',
				};
			},
		},
	],
	toDOM: (node) => [
		'div',
		{
			class: 'math-display',
			'data-math-type': 'block',
			'data-value': node.attrs.value,
		},
		`$$\n${node.attrs.value}\n$$`,
	],
	parseMarkdown: {
		match: (node) => node.type === 'math',
		runner: (state, node, type) => {
			state.addNode(type, { value: (node.value as string) || '' });
		},
	},
	toMarkdown: {
		match: (node) => node.type.name === 'math_display',
		runner: (state, node) => {
			state.addNode('math', undefined, node.attrs.value);
		},
	},
}));

// ---------------------------------------------------------------------------
// NodeViews: render math with KaTeX
// ---------------------------------------------------------------------------
export const mathViewPlugin = $prose(() => {
	return new Plugin({
		key: new PluginKey('math-nodeview'),
		props: {
			nodeViews: {
				math_inline: (node: Node) => {
					const dom = document.createElement('span');
					dom.className = 'math-inline-rendered';
					let currentValue = node.attrs.value as string;
					if (currentValue) {
						renderKatex(dom, currentValue, false);
					} else {
						dom.textContent = '$\\ldots$';
					}
					return {
						dom,
						update(updatedNode: Node): boolean {
							if (updatedNode.type.name !== 'math_inline') return false;
							const newValue = updatedNode.attrs.value as string;
							if (newValue === currentValue) return true;
							currentValue = newValue;
							if (newValue) {
								renderKatex(dom, newValue, false);
							} else {
								dom.textContent = '$\\ldots$';
							}
							return true;
						},
						ignoreMutation: () => true,
					};
				},
				math_display: (node: Node) => {
					const dom = document.createElement('div');
					dom.className = 'math-display-rendered';
					let currentValue = node.attrs.value as string;
					if (currentValue) {
						renderKatex(dom, currentValue, true);
					} else {
						dom.textContent = '$$\\ldots$$';
					}
					return {
						dom,
						update(updatedNode: Node): boolean {
							if (updatedNode.type.name !== 'math_display') return false;
							const newValue = updatedNode.attrs.value as string;
							if (newValue === currentValue) return true;
							currentValue = newValue;
							if (newValue) {
								renderKatex(dom, newValue, true);
							} else {
								dom.textContent = '$$\\ldots$$';
							}
							return true;
						},
						ignoreMutation: () => true,
					};
				},
			},
		},
	});
});
