export function containsRemoteCacheWarning(s: string): boolean {
	return /\s+WARNING: Remote Cache:/.test(s);
}

export function containsRemoteCacheUsage(s: string): boolean {
	return /remote[- ]cache/.test(s);
}

/**
 * matches if a partial upload happened. I think that some content is dropped
 * as the Service comes up, so we can be a bit tolerant of it.
 */
export function containsNonZeroUploadTimedOut(s: string): boolean {
	const match =
		/com\.google\.devtools\.build\.lib\.remote\.http\.UploadTimeoutException: .*timed out\. Sent (\d+) bytes/g.exec(
			s
		);
	if (match === null) return false;

	if (+match[1] > 0) return true;

	return false;
}
