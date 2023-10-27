export function containsRemoteCacheWarning(s: string): boolean {
	return /\s+WARNING: Remote Cache:/.test(s);
}

export function containsRemoteCacheSuccess(s: string): boolean {
	return /INFO:\s+\d+\s+processes:.*\s*\b\d+\s+\bremote/.test(s);
}

/**
 * matches if a partial upload happened. I think that some content is dropped
 * as the Service comes up, so we can be a bit tolerant of it.
 */
export function containsNonZeroUploadTimedOut(s: string): boolean {
	const match =
		/com\.google\.devtools\.build\.lib\.remote\.http\.UploadTimeoutException: .*timed out. Sent (\d+) bytes/gm.exec(
			s
		);
	if (match === null) return false;

	if (+match[0] > 0) return true;

	return false;
}
