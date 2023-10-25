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

test('matchers', () => {
	expect(
		matchers.containsRemoteCacheSuccess(remote_cache_success_corpus)
	).toBe(true);
	expect(
		matchers.containsRemoteCacheWarning(remote_cache_warning_corpus)
	).toBe(true);
});
