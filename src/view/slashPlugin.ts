import { editorViewCtx } from '@milkdown/core';
import type { Ctx } from '@milkdown/ctx';
import { SlashProvider, slashFactory } from '@milkdown/plugin-slash';
import {
	createCodeBlockCommand,
	insertHrCommand,
	wrapInBlockquoteCommand,
	wrapInBulletListCommand,
	wrapInHeadingCommand,
	wrapInOrderedListCommand,
} from '@milkdown/preset-commonmark';
import { insertTableCommand } from '@milkdown/preset-gfm';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose, callCommand } from '@milkdown/utils';

// -------------------------------------------------------
// Menu item definitions
// -------------------------------------------------------

interface SlashMenuItem {
	label: string;
	icon: string;
	keywords: string[];
	execute: (ctx: Ctx) => void;
}

// SVG icons (16x16, currentColor)
const ICONS = {
	heading1:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h8M4 6v12M12 6v12"/><path d="M17 12l3-2v8" stroke-linecap="round"/></svg>',
	heading2:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h8M4 6v12M12 6v12"/><path d="M16.5 10.5a2 2 0 114 0c0 1.5-4 3-4 4.5h4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
	heading3:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h8M4 6v12M12 6v12"/><path d="M16.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM16.5 16a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" stroke-linecap="round"/></svg>',
	bulletList:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="18" r="1" fill="currentColor"/></svg>',
	orderedList:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><text x="4" y="8" font-size="6" fill="currentColor" stroke="none">1</text><text x="4" y="14" font-size="6" fill="currentColor" stroke="none">2</text><text x="4" y="20" font-size="6" fill="currentColor" stroke="none">3</text></svg>',
	taskList:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="4" height="4" rx="0.5"/><line x1="10" y1="7" x2="21" y2="7"/><rect x="3" y="15" width="4" height="4" rx="0.5"/><path d="M4 17l1.5 1.5L7 16"/><line x1="10" y1="17" x2="21" y2="17"/></svg>',
	codeBlock:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
	blockquote:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.69 11 13.2 11 15c0 1.88-1.567 3.5-3.5 3.5-1.073 0-2.099-.47-2.917-1.179zM14.583 17.321C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.69 21 13.2 21 15c0 1.88-1.567 3.5-3.5 3.5-1.073 0-2.099-.47-2.917-1.179z"/></svg>',
	hr: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>',
	table:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
	math: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20L8 4M8 4L12 20M6 14h4"/><path d="M15 8h6M18 5v6"/></svg>',
	mermaid:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="8.5" y="16" width="7" height="5" rx="1"/><path d="M6.5 8v3a3 3 0 003 3h5a3 3 0 003-3V8"/><line x1="12" y1="14" x2="12" y2="16"/></svg>',
};

function buildMenuItems(): SlashMenuItem[] {
	return [
		{
			label: 'Heading 1',
			icon: ICONS.heading1,
			keywords: ['h1', 'heading', 'title'],
			execute: (ctx) => callCommand(wrapInHeadingCommand.key, 1)(ctx),
		},
		{
			label: 'Heading 2',
			icon: ICONS.heading2,
			keywords: ['h2', 'heading', 'subtitle'],
			execute: (ctx) => callCommand(wrapInHeadingCommand.key, 2)(ctx),
		},
		{
			label: 'Heading 3',
			icon: ICONS.heading3,
			keywords: ['h3', 'heading'],
			execute: (ctx) => callCommand(wrapInHeadingCommand.key, 3)(ctx),
		},
		{
			label: 'Bullet List',
			icon: ICONS.bulletList,
			keywords: ['bullet', 'list', 'ul', 'unordered'],
			execute: (ctx) => callCommand(wrapInBulletListCommand.key)(ctx),
		},
		{
			label: 'Ordered List',
			icon: ICONS.orderedList,
			keywords: ['ordered', 'list', 'ol', 'numbered'],
			execute: (ctx) => callCommand(wrapInOrderedListCommand.key)(ctx),
		},
		{
			label: 'Task List',
			icon: ICONS.taskList,
			keywords: ['task', 'todo', 'checkbox', 'check'],
			execute: (ctx) => {
				// First wrap in bullet list, then set checked attribute
				callCommand(wrapInBulletListCommand.key)(ctx);
				const view = ctx.get(editorViewCtx);
				const { state, dispatch } = view;
				const { $from } = state.selection;
				// Find the closest list_item and set checked = false
				for (let d = $from.depth; d > 0; d--) {
					const node = $from.node(d);
					if (node.type.name === 'list_item') {
						const pos = $from.before(d);
						dispatch(
							state.tr.setNodeMarkup(pos, undefined, {
								...node.attrs,
								checked: false,
							}),
						);
						break;
					}
				}
			},
		},
		{
			label: 'Code Block',
			icon: ICONS.codeBlock,
			keywords: ['code', 'pre', 'block', 'snippet'],
			execute: (ctx) => callCommand(createCodeBlockCommand.key)(ctx),
		},
		{
			label: 'Blockquote',
			icon: ICONS.blockquote,
			keywords: ['quote', 'blockquote', 'callout'],
			execute: (ctx) => callCommand(wrapInBlockquoteCommand.key)(ctx),
		},
		{
			label: 'Horizontal Rule',
			icon: ICONS.hr,
			keywords: ['hr', 'divider', 'separator', 'line', 'horizontal'],
			execute: (ctx) => callCommand(insertHrCommand.key)(ctx),
		},
		{
			label: 'Table',
			icon: ICONS.table,
			keywords: ['table', 'grid'],
			execute: (ctx) =>
				callCommand(insertTableCommand.key, { row: 3, col: 3 })(ctx),
		},
		{
			label: 'Math Block',
			icon: ICONS.math,
			keywords: ['math', 'equation', 'formula', 'katex', 'latex'],
			execute: (ctx) => {
				const view = ctx.get(editorViewCtx);
				const { state, dispatch } = view;
				const mathType = state.schema.nodes.math_display;
				if (mathType) {
					const node = mathType.create({ value: '' });
					dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
				}
			},
		},
		{
			label: 'Mermaid Diagram',
			icon: ICONS.mermaid,
			keywords: ['mermaid', 'diagram', 'flowchart', 'chart', 'graph'],
			execute: (ctx) => {
				const view = ctx.get(editorViewCtx);
				const { state, dispatch } = view;
				const codeBlockType = state.schema.nodes.code_block;
				if (codeBlockType) {
					const node = codeBlockType.create({ language: 'mermaid' });
					dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
				}
			},
		},
	];
}

// -------------------------------------------------------
// Slash menu DOM & interaction
// -------------------------------------------------------

interface SlashMenu {
	container: HTMLElement;
	setFilter: (query: string) => void;
	getFilteredCount: () => number;
	getSelectedIndex: () => number;
	setSelectedIndex: (idx: number) => void;
	executeSelected: (ctx: Ctx, view: EditorView) => void;
}

function createSlashMenu(): SlashMenu {
	const items = buildMenuItems();
	const container = document.createElement('div');
	container.className = 'slash-menu';

	let selectedIndex = 0;
	let filteredEntries: { item: SlashMenuItem; el: HTMLElement }[] = [];

	const entries = items.map((item) => {
		const el = document.createElement('div');
		el.className = 'slash-menu-item';

		const iconSpan = document.createElement('span');
		iconSpan.className = 'slash-menu-item-icon';
		iconSpan.innerHTML = item.icon;

		const labelSpan = document.createElement('span');
		labelSpan.className = 'slash-menu-item-label';
		labelSpan.textContent = item.label;

		el.appendChild(iconSpan);
		el.appendChild(labelSpan);
		container.appendChild(el);

		return { item, el };
	});

	function updateSelection(): void {
		for (let i = 0; i < filteredEntries.length; i++) {
			const cls = filteredEntries[i].el.classList;
			if (i === selectedIndex) {
				cls.add('slash-menu-item--active');
				filteredEntries[i].el.scrollIntoView({ block: 'nearest' });
			} else {
				cls.remove('slash-menu-item--active');
			}
		}
	}

	function setFilter(query: string): void {
		const q = query.toLowerCase();
		filteredEntries = [];
		for (const entry of entries) {
			const matches =
				!q ||
				entry.item.label.toLowerCase().includes(q) ||
				entry.item.keywords.some((kw) => kw.includes(q));
			entry.el.style.display = matches ? '' : 'none';
			if (matches) filteredEntries.push(entry);
		}
		selectedIndex = 0;
		updateSelection();
	}

	setFilter('');

	return {
		container,
		setFilter,
		getFilteredCount: () => filteredEntries.length,
		getSelectedIndex: () => selectedIndex,
		setSelectedIndex: (idx: number) => {
			selectedIndex = Math.max(0, Math.min(idx, filteredEntries.length - 1));
			updateSelection();
		},
		executeSelected: (ctx: Ctx, view: EditorView) => {
			if (
				filteredEntries.length > 0 &&
				selectedIndex < filteredEntries.length
			) {
				removeSlashText(view);
				filteredEntries[selectedIndex].item.execute(ctx);
			}
		},
	};
}

/**
 * Remove the "/query" text from the document before executing the command.
 */
function removeSlashText(view: EditorView): void {
	const { state, dispatch } = view;
	const { $from } = state.selection;
	const textBefore = state.doc.textBetween(
		$from.start(),
		$from.pos,
		'\0',
		'\0',
	);
	const slashIndex = textBefore.lastIndexOf('/');
	if (slashIndex === -1) return;
	const deleteFrom = $from.start() + slashIndex;
	dispatch(state.tr.delete(deleteFrom, $from.pos));
}

// -------------------------------------------------------
// Milkdown plugin exports
// -------------------------------------------------------

export const slash = slashFactory('main-slash');

// Module-level shared state for keyboard plugin
let sharedMenu: SlashMenu | null = null;
let sharedProvider: SlashProvider | null = null;
let sharedCtx: Ctx | null = null;

export function configureSlash(ctx: Ctx): void {
	const menu = createSlashMenu();
	sharedMenu = menu;
	sharedCtx = ctx;

	ctx.set(slash.key, {
		view: (view: EditorView) => {
			const provider = new SlashProvider({
				content: menu.container,
				debounce: 50,
				shouldShow: (v) => {
					const content = provider.getContent(v);
					if (!content) return false;

					const slashIndex = content.lastIndexOf('/');
					if (slashIndex === -1) return false;

					// Only trigger if "/" is at start or preceded by whitespace
					if (slashIndex > 0 && content[slashIndex - 1] !== ' ') return false;

					const query = content.slice(slashIndex + 1);
					menu.setFilter(query);

					return menu.getFilteredCount() > 0;
				},
			});

			sharedProvider = provider;

			// Click handler
			menu.container.addEventListener('mousedown', (e) => {
				e.preventDefault();
				const target = (e.target as HTMLElement).closest('.slash-menu-item');
				if (!target) return;
				menu.executeSelected(ctx, view);
				provider.hide();
			});

			return {
				update: (updatedView: EditorView) => {
					provider.update(updatedView);
				},
				destroy: () => {
					provider.destroy();
					menu.container.remove();
					sharedProvider = null;
					sharedMenu = null;
					sharedCtx = null;
				},
			};
		},
	});
}

/**
 * ProseMirror plugin for keyboard navigation when slash menu is visible.
 */
export const slashKeyboardPlugin = $prose(() => {
	return new Plugin({
		key: new PluginKey('slash-keyboard'),
		props: {
			handleKeyDown(view, event) {
				if (!sharedMenu || !sharedProvider || !sharedCtx) return false;

				// Check if menu is visible
				const el = sharedProvider.element;
				if (!el || el.dataset.show !== 'true') return false;

				switch (event.key) {
					case 'ArrowDown': {
						event.preventDefault();
						sharedMenu.setSelectedIndex(sharedMenu.getSelectedIndex() + 1);
						return true;
					}
					case 'ArrowUp': {
						event.preventDefault();
						sharedMenu.setSelectedIndex(sharedMenu.getSelectedIndex() - 1);
						return true;
					}
					case 'Enter': {
						event.preventDefault();
						sharedMenu.executeSelected(sharedCtx, view);
						sharedProvider.hide();
						return true;
					}
					case 'Escape': {
						event.preventDefault();
						sharedProvider.hide();
						return true;
					}
					default:
						return false;
				}
			},
		},
	});
});
