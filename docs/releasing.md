# Internal release contract

The Origin `package` workflow is the release path. Main-branch pushes validate the
exact triggering commit, build and pack the library, then publish that verified
tarball to the approved internal registry. No image or cluster deployment is needed
for this architecture-neutral JavaScript package.

Required repository secrets:

- `GIT_PASSWORD`: read access for the exact repository checkout.
- `VERDACCIO_REGISTRY`: approved internal registry URL reachable from `deploy-lane`.
- `VERDACCIO_TOKEN`: internal publisher token, available only to the publication step.

The publisher refuses other registries, rejects dirty tracked inputs, checks package
identity and digest, and never overwrites a published version. An exact artifact
replay is a verified no-op; changed content requires a new version. Registry errors
are failures, not evidence that a version is absent. The same token is reused;
routine credential rotation is not part of a package release.

After publication, a consumer must update its pinned version and lockfile through
its own CI pipeline. Verify a clean install and the actual rendered consumer before
claiming the integration is complete. Public package dependencies retain public
registry lockfile URLs; private package tarballs use the approved internal registry.

Keep this repository private until code, examples, artifacts, dependencies and
notices pass the separate public-release audit. Do not add a public mirror or npm
publisher as an incidental release step.
