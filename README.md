# Monorepo

This is a bazel monorepo containing most of my side-projects and websites etc. Using a monorepo in this way makes it much easier to ensure linting and deployment are consistent across many projects, and prevents a lot of version rot.

## Usage

The repo is going through a bit of an identity crisis at the moment. I have just completed migration to rules_js, which uses PNPM -- and the PNPM binary is controlled by bazel itself.

I recommend having a local 'bazel' installation. However, if you just have NPM installed, you can:

```
npx @bazel/bazelisk test //...
```

This will recursively run all tests in parallel.

## Neat features

1. **Continuous patching**. Because Bazel allows this repo to be fully tested, Mend is able to automatically integrate patches for any and all dependencies of any project in this repo automatically.
2. **Linting**. There are central rules that enforce basic linting standards.
3. **Continuous deployment**. Every day, this repo runs a deploy script which detects any changes in any files and re-deploys or publishes any changed packages or services.
4. **Automatic versioning**. The packages published on NPM use the venerable api-extractor to detect major or minor version changes to the API, and automatically increment version numbers as relevant.

This is a test that remote caching works!
