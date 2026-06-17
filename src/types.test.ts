import { describe, it, expect } from 'vitest';
import { FeedFetchError, FeedParseError } from './types.js';

describe('typed errors', () => {
  it('FeedFetchError is an Error with a name', () => {
    const err = new FeedFetchError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('FeedFetchError');
    expect(err.message).toBe('boom');
  });

  it('FeedParseError is an Error with a name', () => {
    const err = new FeedParseError('bad ics');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('FeedParseError');
    expect(err.message).toBe('bad ics');
  });
});
