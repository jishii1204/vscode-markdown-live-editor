# Markdown Live Editor

A WYSIWYG Markdown editor extension for Visual Studio Code.
Edit your Markdown files visually — what you see is what you get.

## Features

- **WYSIWYG editing** — Edit Markdown visually with [Milkdown](https://milkdown.dev/) (ProseMirror-based)
- **Bidirectional sync** — Changes in the visual editor update the source file, and vice versa
- **GFM support** — Tables, task lists, strikethrough, footnotes
- **Syntax highlighting** — Code blocks with language-aware highlighting via [highlight.js](https://highlightjs.org/)
- **Mermaid diagrams** — Live preview of `mermaid` code blocks
- **KaTeX math** — Inline `$...$` and block `$$...$$` math rendering
- **GitHub Alerts** — `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`
- **Emoji shortcodes** — `:smile:` → 😄, `:rocket:` → 🚀
- **Custom CSS** — Inject your own styles via `markdownLiveEditor.customCss` setting
- **VS Code theme integration** — Adapts to light/dark/high-contrast themes

## Usage

### Opening the Editor

- **Command Palette**: `Markdown Live Editor: Open with Markdown Live Editor`
- **Keyboard shortcut**: `Ctrl+Shift+Alt+M` (Mac: `Cmd+Shift+Alt+M`) while editing a Markdown file
- **Explorer context menu**: Right-click a `.md` file → "Open with Markdown Live Editor"
- **Editor tab context menu**: Right-click the tab of an open `.md` file

### Settings

| Setting | Description |
|---------|-------------|
| `markdownLiveEditor.customCss` | Custom CSS to inject into the editor |

## Development

### Prerequisites

- Node.js 22+
- npm

### Setup

```bash
git clone https://github.com/jishii1204/vscode-markdown-live.git
cd vscode-markdown-live
npm install
```

### Run in Development

1. Open this project in VS Code
2. Press `F5` to launch the Extension Development Host
3. Open any `.md` file, then use the command palette or context menu to open it with Markdown Live Editor

### Build

```bash
npm run compile
```

### Lint

```bash
npm run lint        # Check
npm run lint:fix    # Auto-fix
```

## Tech Stack

- TypeScript
- VS Code Extension API (CustomTextEditorProvider)
- [Milkdown](https://milkdown.dev/) — WYSIWYG Markdown editor framework
- [ProseMirror](https://prosemirror.net/) — Rich text editing toolkit
- [highlight.js](https://highlightjs.org/) — Syntax highlighting
- [Mermaid](https://mermaid.js.org/) — Diagram rendering
- [KaTeX](https://katex.org/) — Math typesetting
- [esbuild](https://esbuild.github.io/) — Bundler
- [Biome](https://biomejs.dev/) — Linter & formatter

## License

[MIT](LICENSE)
