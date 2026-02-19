import type * as vscode from 'vscode';
import { MarkdownEditorProvider } from './provider/markdownEditorProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(MarkdownEditorProvider.register(context));
}

export function deactivate() {}
