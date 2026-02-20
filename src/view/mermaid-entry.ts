/**
 * Separate mermaid bundle entry point.
 * Built as a standalone IIFE and lazy-loaded via dynamic <script> tag
 * only when a mermaid code block is present in the document.
 */
import mermaid from 'mermaid';

(window as unknown as Record<string, unknown>).__mermaid = mermaid;
