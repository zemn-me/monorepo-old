export function containsRemoteCacheWarning(s: string): boolean {
	return /\s+WARNING: Remote Cache:/.test(s);
}

export function containsRemoteCacheSuccess(s: string): boolean {
	return /INFO:\s+\d+\s+processes:.*\s*\b\d+\s+\bremote/.test(s);
}
