const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * Plugin to copy style.css to media/ after build
 * @type {import('esbuild').Plugin}
 */
const copyStylePlugin = {
	name: 'copy-style',
	setup(build) {
		build.onEnd(() => {
			const src = path.resolve(__dirname, 'src/view/style.css');
			const dest = path.resolve(__dirname, 'media/style.css');
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.copyFileSync(src, dest);
		});
	},
};

async function main() {
	// Extension Host bundle (Node.js)
	const extCtx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});

	// Webview bundle (browser)
	const viewCtx = await esbuild.context({
		entryPoints: ['src/view/view.ts'],
		bundle: true,
		format: 'iife',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'media/view.js',
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin, copyStylePlugin],
	});

	if (watch) {
		await Promise.all([extCtx.watch(), viewCtx.watch()]);
	} else {
		await Promise.all([extCtx.rebuild(), viewCtx.rebuild()]);
		await Promise.all([extCtx.dispose(), viewCtx.dispose()]);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
