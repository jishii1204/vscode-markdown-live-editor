import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './provider/markdownEditorProvider';
import { OutlineProvider } from './provider/outlineProvider';

export function activate(context: vscode.ExtensionContext) {
	const outlineProvider = new OutlineProvider();

	const treeView = vscode.window.createTreeView('markdownLiveEditor.outline', {
		treeDataProvider: outlineProvider,
		showCollapseAll: true,
	});

	context.subscriptions.push(treeView);
	context.subscriptions.push(
		MarkdownEditorProvider.register(context, outlineProvider),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'markdownLiveEditor.openEditor',
			(uri?: vscode.Uri) => {
				const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
				if (targetUri) {
					vscode.commands.executeCommand(
						'vscode.openWith',
						targetUri,
						MarkdownEditorProvider.viewType,
					);
				}
			},
		),
	);
}

export function deactivate() {}
