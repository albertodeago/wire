# Changelog

## v0.2.0

feat: Enable WIRE to publish single workflows without name prefix in tags
`tag-pattern` now doesn't require `{name}` when releasing a single component.

This means that you can use WIRE to release workflows or actions without the need for a name prefix in the tags, simplifying versioning for single-workflow repositories.
Tags are going to look like `v1.0.0` and `v1` instead of `workflow-a/v1.0.0` and `workflow-a/v1` as users are used to.

## v0.1.0 - Initial Release
- Initial release of WIRE
