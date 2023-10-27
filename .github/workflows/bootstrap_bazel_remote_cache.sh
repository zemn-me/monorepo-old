#!/usr/bin/env bash
# Dummy.



echo "::group::Configure Bazel Remote Cache"

if [[ -z "${BUILDBUDDY_API_KEY}" ]]; then
	echo "::warning file=.github/workflows/bootstrap_bazel_remote_cache.sh,line=3,endLine=3,title=Running without bazel cache!:: BUILDBUDDY_API_KEY was not specified, so tests will be doing all the work from scratch."
else
	echo "Using bazel remote cache."
	echo "build --remote_header=x-buildbuddy-api-key=${BUILDBUDDY_API_KEY}" > .auth.bazelrc
fi

echo "::endgroup::"

exit 0



