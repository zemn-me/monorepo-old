load("//js/eslint:rules.bzl", "eslint_test")

def mdx_lint(name, srcs = None):
    eslint_test(
        name = name,
        srcs = srcs
    )

def mdx_files(name, srcs = None):
    mdx_lint(
        name = name + "_lint",
        srcs = srcs
    )

    native.filegroup(
        name = name,
        srcs = srcs
    )