import * as matchers from 'ts/pulumi/bazel_rce/matchers/matchers';

const remote_cache_warning_corpus = `
WARNING: Remote Cache: 21 errors during bulk transfer:
com.google.devtools.build.lib.remote.http.HttpException: 401 Unauthorized
401 Unauthorized
com.google.devtools.build.lib.remote.http.HttpException: 401 Unauthorized
401 Unauthorized
`;

const remote_cache_success_corpus = `
INFO: 11 processes: 6 remote cache hit, 3 internal, 2 remote.
`;

const non_zero_upload_timed_out = `
com.google.devtools.build.lib.remote.http.UploadTimeoutException: Upload of '/cas/ba80c8c047b9de7065f1606b29f673bde54332256b7ff58226367bff21b06b9c' timed out. Sent 3271010 bytes.
`;

const non_zero_upload_timed_out_incorrect = `
com.google.devtools.build.lib.remote.http.UploadTimeoutException: Upload of '/cas/ba80c8c047b9de7065f1606b29f673bde54332256b7ff58226367bff21b06b9c' timed out. Sent 0 bytes.
`;

test('matchers', () => {
	expect(
		matchers.containsRemoteCacheSuccess(remote_cache_success_corpus)
	).toBe(true);
	expect(
		matchers.containsRemoteCacheWarning(remote_cache_warning_corpus)
	).toBe(true);
	expect(
		matchers.containsNonZeroUploadTimedOut(non_zero_upload_timed_out)
	).toBe(true);
	expect(
		matchers.containsNonZeroUploadTimedOut(
			non_zero_upload_timed_out_incorrect
		)
	).toBe(false);
});
