#! /usr/bin/env bash

echo "::group::Configure Bazel Remote Cache"

if [[ -z "${BAZEL_REMOTE_CACHE_URL}" ]]; then
	echo "::warning file=.github/workflows/bootstrap_bazel_remote_cache.sh,line=3,endLine=3,title=Running without bazel cache!:: BAZEL_REMOTE_CACHE_URL was not specified, so tests will be doing all the work from scratch."
else
	echo "Using bazel remote cache."
	echo "build --remote_cache=${BAZEL_REMOTE_CACHE_URL}" > .bazelrc
	echo "test --remote_cache=${BAZEL_REMOTE_CACHE_URL}" > .bazelrc
	echo "$BAZEL_REMOTE_CACHE_URL"
fi

echo "::endgroup::"

exit 0
