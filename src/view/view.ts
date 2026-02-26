import {
	defaultValueCtx,
	Editor,
	editorStateCtx,
	editorViewCtx,
	parserCtx,
	rootCtx,
	serializerCtx,
} from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import type { Node as ProseMirrorNode } from '@milkdown/prose/model';
import { Plugin, TextSelection } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';
import { alertPlugin } from './alertPlugin';
import { codeBlockPlugin, highlightPlugin } from './codeBlockPlugin';
import { emojiPlugin } from './emojiPlugin';
import { imageViewPlugin, setDocumentDirUri } from './imagePlugin';
import {
	mathDisplaySchema,
	mathInlineSchema,
	mathViewPlugin,
	remarkMathPlugin,
} from './katexPlugin';
import { configureSlash, slash, slashKeyboardPlugin } from './slashPlugin';
import { configureTableBlock, tableBlock } from './tableBlockPlugin';
import {
	configureCustomLinkTooltip,
	configureSelectionToolbar,
	linkTooltipPlugin,
	selectionToolbar,
} from './toolbarPlugin';

declare function acquireVsCodeApi(): {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// Global error handler — show errors visually in the webview
function showError(msg: string): void {
	console.error(`[view] ${msg}`);
	const el = document.createElement('pre');
	el.style.cssText =
		'color:#f44;background:#1e1e1e;padding:16px;margin:16px;border:2px solid #f44;font-size:13px;white-space:pre-wrap;';
	el.textContent = msg;
	document.body.prepend(el);
}
window.onerror = (_msg, _src, _line, _col, err) => {
	showError(`Uncaught: ${err?.stack || err || _msg}`);
};
window.addEventListener('unhandledrejection', (e) => {
	showError(`Unhandled rejection: ${e.reason?.stack || e.reason}`);
});

// Strip spurious <br /> that Milkdown's remarkPreserveEmptyLinePlugin
// inserts into empty table cells during serialization.
function cleanupTableBr(md: string): string {
	return md
		.split('\n')
		.map((line) =>
			line.startsWith('|') ? line.replaceAll('<br />', '') : line,
		)
		.join('\n');
}

let editor: Editor | null = null;
let isUpdatingFromExtension = false;

// We compare against the normalized baseline to detect real user changes.
// This prevents the file from being dirtied just by opening it in the editor.
let normalizedBaseline = '';
let isInitializing = false;

// Debounce timer for sending updates to the extension host.
// Batches rapid keystrokes into a single postMessage call.
let updateTimer: ReturnType<typeof setTimeout> | null = null;
const UPDATE_DELAY_MS = 300;

// ProseMirror plugin that detects doc changes and syncs to the extension host.
// Unlike Milkdown's markdownUpdated listener, this does NOT serialize the
// document on every keystroke. Serialization only happens when the debounce
// timer fires (after the user stops typing for UPDATE_DELAY_MS).
const syncPlugin = $prose((ctx) => {
	return new Plugin({
		view() {
			return {
				update(view, prevState) {
					if (isInitializing || isUpdatingFromExtension) return;
					if (view.state.doc.eq(prevState.doc)) return;

					if (updateTimer) clearTimeout(updateTimer);
					updateTimer = setTimeout(() => {
						updateTimer = null;
						const serializer = ctx.get(serializerCtx);
						const md = cleanupTableBr(serializer(view.state.doc));
						if (md === normalizedBaseline) return;
						vscode.postMessage({ type: 'update', body: md });
						normalizedBaseline = md;
					}, UPDATE_DELAY_MS);
				},
			};
		},
	});
});

// -------------------------------------------------------
// Heading extraction — sends headings to the extension host
// for the outline panel (TreeView).
// -------------------------------------------------------

interface HeadingData {
	text: string;
	level: number;
	pos: number;
}

function extractHeadings(doc: ProseMirrorNode): HeadingData[] {
	const headings: HeadingData[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			const text = node.textContent.trim();
			if (!text) return;
			headings.push({
				text,
				level: node.attrs.level as number,
				pos,
			});
		}
	});
	return headings;
}

let lastHeadings: HeadingData[] = [];

function headingsEqual(a: HeadingData[], b: HeadingData[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (
			a[i].text !== b[i].text ||
			a[i].level !== b[i].level ||
			a[i].pos !== b[i].pos
		) {
			return false;
		}
	}
	return true;
}

function sendHeadings(doc: ProseMirrorNode): void {
	const headings = extractHeadings(doc);
	if (headingsEqual(headings, lastHeadings)) return;
	lastHeadings = headings;
	vscode.postMessage({ type: 'headings', items: headings });
}

const headingExtractPlugin = $prose((_ctx) => {
	return new Plugin({
		view() {
			return {
				update(view, prevState) {
					if (isInitializing || isUpdatingFromExtension) return;
					if (view.state.doc.eq(prevState.doc)) return;
					sendHeadings(view.state.doc);
				},
			};
		},
	});
});

async function createEditor(
	container: HTMLElement,
	markdown: string,
): Promise<Editor> {
	isInitializing = true;

	const instance = Editor.make()
		.config((ctx) => {
			ctx.set(rootCtx, container);
			ctx.set(defaultValueCtx, markdown);
		})
		.use(commonmark)
		.use(gfm)
		.use(tableBlock)
		.config(configureTableBlock)
		.use(remarkMathPlugin)
		.use(mathInlineSchema)
		.use(mathDisplaySchema)
		.use(emojiPlugin)
		.use(syncPlugin)
		.use(headingExtractPlugin)
		.use(codeBlockPlugin)
		.use(highlightPlugin)
		.use(alertPlugin)
		.use(mathViewPlugin)
		.use(imageViewPlugin)
		.use(selectionToolbar)
		.config(configureSelectionToolbar)
		.use(linkTooltipPlugin)
		.config(configureCustomLinkTooltip)
		.use(slash)
		.config(configureSlash)
		.use(slashKeyboardPlugin);

	await instance.create();

	// Capture the normalized baseline after editor is fully initialized
	instance.action((ctx) => {
		const serializer = ctx.get(serializerCtx);
		normalizedBaseline = cleanupTableBr(
			serializer(ctx.get(editorStateCtx).doc),
		);
	});

	isInitializing = false;
	return instance;
}

function replaceContent(newMarkdown: string): void {
	if (!editor) {
		return;
	}
	isUpdatingFromExtension = true;
	try {
		editor.action((ctx) => {
			const view = ctx.get(editorViewCtx);
			const serializer = ctx.get(serializerCtx);
			const currentMarkdown = cleanupTableBr(
				serializer(ctx.get(editorStateCtx).doc),
			);

			if (currentMarkdown === newMarkdown) {
				isUpdatingFromExtension = false;
				return;
			}

			const parser = ctx.get(parserCtx);
			const newDoc = parser(newMarkdown);
			const { tr } = view.state;
			tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
			view.dispatch(tr);

			// Update baseline to the new normalized content
			const updatedDoc = ctx.get(editorStateCtx).doc;
			normalizedBaseline = cleanupTableBr(serializer(updatedDoc));
			isUpdatingFromExtension = false;
			sendHeadings(updatedDoc);
		});
	} catch {
		isUpdatingFromExtension = false;
	}
}

// Handle messages from the extension host
window.addEventListener('message', (event) => {
	const message = event.data;
	switch (message.type) {
		case 'init': {
			const container = document.getElementById('editor');
			if (!container) {
				return;
			}
			if (message.documentDirUri) {
				setDocumentDirUri(message.documentDirUri);
			}
			createEditor(container, message.body)
				.then((e) => {
					editor = e;
					e.action((ctx) => {
						sendHeadings(ctx.get(editorStateCtx).doc);
					});
				})
				.catch((err) => {
					showError(`Editor init failed: ${err?.stack || err}`);
				});
			break;
		}
		case 'update': {
			replaceContent(message.body);
			break;
		}
		case 'scrollToHeading': {
			if (!editor) break;
			editor.action((ctx) => {
				const view = ctx.get(editorViewCtx);
				const pos = message.pos as number;
				const { doc } = view.state;
				if (pos < 0 || pos >= doc.content.size) return;
				const selection = TextSelection.near(doc.resolve(pos));
				view.dispatch(view.state.tr.setSelection(selection));
				// Use DOM scrollIntoView to position the heading at the top
				const dom = view.nodeDOM(pos);
				if (dom instanceof HTMLElement) {
					dom.scrollIntoView({ block: 'start', behavior: 'smooth' });
				}
				view.focus();
			});
			break;
		}
		case 'requestHeadings': {
			if (!editor) break;
			editor.action((ctx) => {
				lastHeadings = [];
				sendHeadings(ctx.get(editorStateCtx).doc);
			});
			break;
		}
	}
});

// Notify the extension host that the webview is ready
vscode.postMessage({ type: 'ready' });
