import * as matchers from 'ts/pulumi/bazel_rce/matchers/matchers';

const remote_cache_warning_corpus = `
WARNING: Remote Cache: 21 errors during bulk transfer:
com.google.devtools.build.lib.remote.http.HttpException: 401 Unauthorized
401 Unauthorized
com.google.devtools.build.lib.remote.http.HttpException: 401 Unauthorized
401 Unauthorized
`;

const remote_cache_success_corpus = `
remote-cache
`;

const non_zero_upload_timed_out = `
something
  com.google.devtools.build.lib.remote.http.UploadTimeoutException: Upload of '/cas/ba80c8c047b9de7065f1606b29f673bde54332256b7ff58226367bff21b06b9c' timed out. Sent 3271010 bytes.
something
`;

const zero_upload_timed_out = `
wawdawdawd
com.google.devtools.build.lib.remote.http.UploadTimeoutException: Upload of '/cas/ba80c8c047b9de7065f1606b29f673bde54332256b7ff58226367bff21b06b9c' timed out. Sent 0 bytes.
waawwdawawd
`;

test('matchers', () => {
	expect(matchers.containsRemoteCacheUsage(remote_cache_success_corpus)).toBe(
		true
	);
	expect(
		matchers.containsRemoteCacheWarning(remote_cache_warning_corpus)
	).toBe(true);
	expect(
		matchers.containsNonZeroUploadTimedOut(non_zero_upload_timed_out)
	).toBe(true);
	expect(matchers.containsNonZeroUploadTimedOut(zero_upload_timed_out)).toBe(
		false
	);
});
