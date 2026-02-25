import {
	configureLinkTooltip,
	linkEditTooltip,
	linkTooltipAPI,
	linkTooltipPlugin,
	linkTooltipState,
	toggleLinkCommand,
} from '@milkdown/components/link-tooltip';
import { editorViewCtx } from '@milkdown/core';
import type { Ctx } from '@milkdown/ctx';
import { TooltipProvider, tooltipFactory } from '@milkdown/plugin-tooltip';
import {
	linkSchema,
	toggleEmphasisCommand,
	toggleInlineCodeCommand,
	toggleStrongCommand,
} from '@milkdown/preset-commonmark';
import { toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { posToDOMRect } from '@milkdown/prose';
import type { Mark } from '@milkdown/prose/model';
import { type PluginView, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { callCommand } from '@milkdown/utils';

// -------------------------------------------------------
// Toolbar button definitions
// -------------------------------------------------------

interface ToolbarButton {
	label: string;
	icon: string;
	title: string;
	execute: (ctx: Ctx) => void;
	/** Mark name to check for active state (null for commands like link). */
	mark: string | null;
}

// SVG icons (16x16, currentColor)
const ICONS = {
	bold: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6z"/></svg>',
	italic:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>',
	strikethrough:
		'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.3 4.9c-1.2-.8-2.8-1.2-4.4-.9-2 .4-3.2 1.6-3.4 3.1-.3 2.3 1.5 3.4 3.4 4"/><line x1="4" y1="12" x2="20" y2="12"/><path d="M15 12.5c1.6.8 2.7 2.2 2.4 4-.4 2-2.3 3.3-4.8 3.5-1.8.1-3.5-.4-4.6-1.4"/></svg>',
	code: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
	link: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
};

function buildButtons(): ToolbarButton[] {
	return [
		{
			label: 'B',
			icon: ICONS.bold,
			title: 'Bold',
			execute: (ctx) => callCommand(toggleStrongCommand.key)(ctx),
			mark: 'strong',
		},
		{
			label: 'I',
			icon: ICONS.italic,
			title: 'Italic',
			execute: (ctx) => callCommand(toggleEmphasisCommand.key)(ctx),
			mark: 'emphasis',
		},
		{
			label: 'S',
			icon: ICONS.strikethrough,
			title: 'Strikethrough',
			execute: (ctx) => callCommand(toggleStrikethroughCommand.key)(ctx),
			mark: 'strikethrough',
		},
		{
			label: '<>',
			icon: ICONS.code,
			title: 'Code',
			execute: (ctx) => callCommand(toggleInlineCodeCommand.key)(ctx),
			mark: 'inlineCode',
		},
		{
			label: '🔗',
			icon: ICONS.link,
			title: 'Link',
			execute: (ctx) => callCommand(toggleLinkCommand.key)(ctx),
			mark: null,
		},
	];
}

// -------------------------------------------------------
// Toolbar DOM
// -------------------------------------------------------

interface ToolbarDOM {
	container: HTMLElement;
	updateActiveStates: (view: EditorView) => void;
}

function createToolbarDOM(ctx: Ctx): ToolbarDOM {
	const buttons = buildButtons();
	const container = document.createElement('div');
	container.className = 'floating-toolbar';

	const buttonElements: { el: HTMLElement; mark: string | null }[] = [];

	for (let i = 0; i < buttons.length; i++) {
		// Add separator before strikethrough and link groups
		if (i === 2 || i === 4) {
			const sep = document.createElement('div');
			sep.className = 'toolbar-separator';
			container.appendChild(sep);
		}

		const btn = buttons[i];
		const el = document.createElement('button');
		el.className = 'toolbar-btn';
		el.title = btn.title;
		el.innerHTML = btn.icon;
		el.setAttribute('data-index', String(i));
		container.appendChild(el);
		buttonElements.push({ el, mark: btn.mark });
	}

	// Prevent focus loss and execute command on click
	container.addEventListener('mousedown', (e) => {
		e.preventDefault();
		const target = (e.target as HTMLElement).closest(
			'.toolbar-btn',
		) as HTMLElement | null;
		if (!target) return;
		const idx = Number(target.getAttribute('data-index'));
		const btn = buttons[idx];
		if (btn) {
			btn.execute(ctx);
		}
	});

	function updateActiveStates(view: EditorView): void {
		const { from, to } = view.state.selection;
		const { schema } = view.state;

		for (const { el, mark } of buttonElements) {
			if (!mark) continue;
			const markType = schema.marks[mark];
			if (markType) {
				el.classList.toggle(
					'active',
					view.state.doc.rangeHasMark(from, to, markType),
				);
			}
		}
	}

	return { container, updateActiveStates };
}

// -------------------------------------------------------
// Custom link edit tooltip (always positioned above)
//
// The built-in LinkEditTooltip uses @floating-ui/dom's flip()
// middleware, which causes the edit tooltip to appear below
// the text when there's not enough space above. We replace it
// with a custom implementation that manually positions above
// without using TooltipProvider (bypassing floating-ui entirely).
// -------------------------------------------------------

interface EditData {
	from: number;
	to: number;
	mark: Mark | null;
}

const defaultEditData: EditData = { from: -1, to: -1, mark: null };

class CustomLinkEditTooltip implements PluginView {
	#content: HTMLElement;
	#input: HTMLInputElement;
	#data: EditData = { ...defaultEditData };
	#ctx: Ctx;
	#view: EditorView;

	constructor(ctx: Ctx, view: EditorView) {
		this.#ctx = ctx;
		this.#view = view;

		// Build DOM
		const content = document.createElement('div');
		content.className = 'milkdown-link-edit';

		const inner = document.createElement('div');
		inner.className = 'link-edit';

		const input = document.createElement('input');
		input.className = 'input-area';
		input.type = 'text';
		input.placeholder = 'Paste link...';
		this.#input = input;

		const confirmBtn = document.createElement('span');
		confirmBtn.className = 'milkdown-icon button confirm';
		confirmBtn.textContent = 'Confirm ⏎';

		inner.appendChild(input);
		inner.appendChild(confirmBtn);
		content.appendChild(inner);
		this.#content = content;

		// Key events on input
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.#confirmEdit();
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				this.#reset();
			}
		});

		// Click confirm button
		confirmBtn.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			this.#confirmEdit();
		});
	}

	#show = (from: number, to: number) => {
		const rect = posToDOMRect(this.#view, from, to);
		const parent = this.#view.dom.parentElement;
		if (!parent) return;

		// Mount if not already
		if (!this.#content.parentElement) {
			parent.appendChild(this.#content);
		}

		this.#content.dataset.show = 'true';

		// Position above the reference, centered horizontally
		requestAnimationFrame(() => {
			const parentRect = parent.getBoundingClientRect();
			const tooltipHeight = this.#content.offsetHeight;
			const tooltipWidth = this.#content.offsetWidth;
			const gap = 8;

			const top = rect.top - parentRect.top - tooltipHeight - gap;
			const left =
				rect.left - parentRect.left + rect.width / 2 - tooltipWidth / 2;

			// Clamp left to stay within parent bounds
			const clampedLeft = Math.max(
				0,
				Math.min(left, parentRect.width - tooltipWidth),
			);

			this.#content.style.top = `${top}px`;
			this.#content.style.left = `${clampedLeft}px`;

			this.#input.focus();
		});
	};

	#hide = () => {
		this.#content.dataset.show = 'false';
		this.#view.dom.focus({ preventScroll: true });
	};

	#reset = () => {
		this.#hide();
		this.#ctx.update(linkTooltipState.key, (state) => ({
			...state,
			mode: 'preview' as const,
		}));
		this.#data = { ...defaultEditData };
	};

	#confirmEdit = () => {
		const href = this.#input.value.trim();
		if (!href) {
			this.#reset();
			return;
		}

		const view = this.#ctx.get(editorViewCtx);
		const { from, to, mark } = this.#data;
		const type = linkSchema.type(this.#ctx);

		if (mark && mark.attrs.href === href) {
			this.#reset();
			return;
		}

		const tr = view.state.tr;
		if (mark) tr.removeMark(from, to, mark);
		tr.addMark(from, to, type.create({ href }));
		view.dispatch(tr);

		this.#reset();
	};

	#enterEditMode = (value: string, from: number, to: number) => {
		this.#input.value = value;
		this.#ctx.update(linkTooltipState.key, (state) => ({
			...state,
			mode: 'edit' as const,
		}));

		const view = this.#ctx.get(editorViewCtx);
		view.dispatch(
			view.state.tr.setSelection(
				TextSelection.create(view.state.doc, from, to),
			),
		);

		this.#show(from, to);
	};

	update = (view: EditorView) => {
		this.#view = view;
		const { state } = view;
		const { selection } = state;
		if (!(selection instanceof TextSelection)) return;
		const { from, to } = selection;
		if (from === this.#data.from && to === this.#data.to) return;
		this.#reset();
	};

	destroy = () => {
		this.#content.remove();
	};

	addLink = (from: number, to: number) => {
		this.#data = { from, to, mark: null };
		this.#enterEditMode('', from, to);
	};

	editLink = (mark: Mark, from: number, to: number) => {
		this.#data = { from, to, mark };
		this.#enterEditMode(mark.attrs.href, from, to);
	};

	removeLink = (from: number, to: number) => {
		const view = this.#ctx.get(editorViewCtx);
		const tr = view.state.tr;
		tr.removeMark(from, to, linkSchema.type(this.#ctx));
		view.dispatch(tr);
		this.#reset();
	};
}

// -------------------------------------------------------
// Milkdown plugin exports
// -------------------------------------------------------

export const selectionToolbar = tooltipFactory('selection-toolbar');

export { linkTooltipPlugin };

/**
 * Configure both the link preview tooltip (built-in) and a custom
 * link edit tooltip that always appears above the selection.
 */
export function configureCustomLinkTooltip(ctx: Ctx): void {
	// Set up both preview and edit tooltips via the built-in configure
	configureLinkTooltip(ctx);

	// Override the edit tooltip with our custom implementation
	let editView: CustomLinkEditTooltip | null = null;

	ctx.update(linkTooltipAPI.key, (api) => ({
		...api,
		addLink: (from: number, to: number) => editView?.addLink(from, to),
		editLink: (mark: Mark, from: number, to: number) =>
			editView?.editLink(mark, from, to),
		removeLink: (from: number, to: number) => editView?.removeLink(from, to),
	}));

	ctx.set(linkEditTooltip.key, {
		view: (view: EditorView) => {
			editView = new CustomLinkEditTooltip(ctx, view);
			return editView;
		},
	});
}

export function configureSelectionToolbar(ctx: Ctx): void {
	const toolbar = createToolbarDOM(ctx);

	ctx.set(selectionToolbar.key, {
		view: (_view: EditorView) => {
			const provider = new TooltipProvider({
				content: toolbar.container,
				shouldShow: (v: EditorView) => {
					const { selection } = v.state;

					// Only show for non-empty text selections
					if (selection.empty) return false;
					if (!(selection instanceof TextSelection)) return false;

					// Don't show inside code blocks
					const $from = v.state.doc.resolve(selection.from);
					if ($from.parent.type.name === 'code_block') return false;

					// Update active states when showing
					toolbar.updateActiveStates(v);
					return true;
				},
				offset: { mainAxis: 8 },
			});

			return {
				update: (updatedView: EditorView, prevState) => {
					provider.update(updatedView, prevState);
				},
				destroy: () => {
					provider.destroy();
					toolbar.container.remove();
				},
			};
		},
	});
}
