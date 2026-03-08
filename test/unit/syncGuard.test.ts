import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	consumeDocumentChange,
	markPendingEcho,
} from '../../src/provider/syncGuard';

describe('syncGuard', () => {
	it('skips exactly one echo-back change from webview', () => {
		let state = markPendingEcho('A');

		const first = consumeDocumentChange(state, 'A');
		assert.equal(first.skip, true);
		state = first.next;

		const second = consumeDocumentChange(state, 'A');
		assert.equal(second.skip, false);
	});

	it('does not skip external change with different text', () => {
		const state = markPendingEcho('A');
		const result = consumeDocumentChange(state, 'B');
		assert.equal(result.skip, false);
	});

	it('allows external change back to old text after pending is consumed', () => {
		let state = markPendingEcho('A');
		state = consumeDocumentChange(state, 'A').next;

		const externalBack = consumeDocumentChange(state, 'A');
		assert.equal(externalBack.skip, false);
	});
});
