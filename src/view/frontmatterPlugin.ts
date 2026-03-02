import type { Node } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $nodeSchema, $prose, $remark } from '@milkdown/utils';
import remarkFrontmatter from 'remark-frontmatter';

// ---------------------------------------------------------------------------
// remark-frontmatter: parse --- YAML --- blocks
// ---------------------------------------------------------------------------
export const remarkFrontmatterPlugin = $remark(
	'remarkFrontmatter',
	() => remarkFrontmatter,
	'yaml',
);

// ---------------------------------------------------------------------------
// ProseMirror node schema for frontmatter
// ---------------------------------------------------------------------------
export const frontmatterSchema = $nodeSchema('frontmatter', () => ({
	group: 'block',
	atom: true,
	defining: true,
	selectable: true,
	isolating: true,
	marks: '',
	attrs: {
		value: { default: '' },
	},
	parseDOM: [
		{
			tag: 'div[data-type="frontmatter"]',
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
			class: 'frontmatter-block',
			'data-type': 'frontmatter',
			'data-value': node.attrs.value,
		},
		`---\n${node.attrs.value}\n---`,
	],
	parseMarkdown: {
		match: (node) => node.type === 'yaml',
		runner: (state, node, type) => {
			state.addNode(type, { value: (node.value as string) || '' });
		},
	},
	toMarkdown: {
		match: (node) => node.type.name === 'frontmatter',
		runner: (state, node) => {
			state.addNode('yaml', undefined, node.attrs.value as string);
		},
	},
}));

// ---------------------------------------------------------------------------
// NodeView: collapsible editable frontmatter block
// ---------------------------------------------------------------------------
export const frontmatterViewPlugin = $prose(() => {
	return new Plugin({
		key: new PluginKey('frontmatter-nodeview'),
		props: {
			nodeViews: {
				frontmatter: (node: Node, view, getPos) => {
					const dom = document.createElement('div');
					dom.className = 'frontmatter-block';

					// Header (click to toggle)
					const header = document.createElement('div');
					header.className = 'frontmatter-header';

					const toggle = document.createElement('span');
					toggle.className = 'frontmatter-toggle';
					toggle.textContent = '\u25B6'; // ▶

					const label = document.createElement('span');
					label.className = 'frontmatter-label';
					label.textContent = 'Frontmatter';

					header.appendChild(toggle);
					header.appendChild(label);

					// Editable textarea for YAML content
					const textarea = document.createElement('textarea');
					textarea.className = 'frontmatter-content';
					let currentValue = (node.attrs.value as string) || '';
					textarea.value = currentValue;
					textarea.spellcheck = false;
					textarea.rows = currentValue.split('\n').length;

					dom.appendChild(header);
					dom.appendChild(textarea);

					// Collapse/expand state
					let expanded = false;

					header.addEventListener('click', () => {
						expanded = !expanded;
						toggle.textContent = expanded ? '\u25BC' : '\u25B6'; // ▼ or ▶
						textarea.classList.toggle('frontmatter-content--visible', expanded);
						if (expanded) textarea.focus();
					});

					// Sync textarea edits back to ProseMirror
					textarea.addEventListener('input', () => {
						const newValue = textarea.value;
						if (newValue === currentValue) return;
						currentValue = newValue;
						textarea.rows = newValue.split('\n').length;
						const pos = getPos();
						if (pos === undefined) return;
						view.dispatch(
							view.state.tr.setNodeMarkup(pos, undefined, { value: newValue }),
						);
					});

					return {
						dom,
						update(updatedNode: Node): boolean {
							if (updatedNode.type.name !== 'frontmatter') return false;
							const newValue = (updatedNode.attrs.value as string) || '';
							if (newValue === currentValue) return true;
							currentValue = newValue;
							textarea.value = newValue;
							textarea.rows = newValue.split('\n').length;
							return true;
						},
						ignoreMutation: () => true,
						stopEvent: () => true,
					};
				},
			},
		},
	});
});
