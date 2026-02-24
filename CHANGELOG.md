# Changelog

All notable changes to Markdown Live Editor will be documented in this file.

## [0.0.4] - 2026-02-24

### Added

- Relative path image display in the editor (resolves local images via webview URI)
- Error fallback display for missing images
- Workspace root access for images in parent directories

## [0.0.3] - 2026-02-24

### Added

- Slash commands — type `/` to insert headings, lists, tables, code blocks, math, mermaid diagrams, and more
- Keyboard navigation (Arrow keys, Enter, Escape) and text filtering in slash menu

## [0.0.2] - 2026-02-24

### Changed

- CI: exclude devDependencies from npm audit

## [0.0.1] - 2026-02-21

### Added

- WYSIWYG Markdown editing with Milkdown (ProseMirror-based)
- Bidirectional sync between visual editor and source file
- GFM support: tables, task lists, strikethrough, footnotes
- Syntax highlighting for code blocks via highlight.js (27 languages)
- Mermaid diagram live preview (lazy-loaded separate bundle)
- KaTeX math rendering (inline `$...$` and block `$$...$$`)
- GitHub Alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`)
- Emoji shortcodes (`:smile:`, `:rocket:`, etc.)
- Custom CSS injection via `markdownLiveEditor.customCss` setting
- VS Code theme integration (light/dark/high-contrast)
