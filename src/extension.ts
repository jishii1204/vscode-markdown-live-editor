import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './provider/markdownEditorProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(MarkdownEditorProvider.register(context));

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
