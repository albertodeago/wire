# WIRE - Workflow Independent Release Engine

<p align="center" style="background-color: #0d1117;">
<img src="./wire-no-bg.png" width="250">
</p>

A GitHub Action for releasing multiple independently-versioned workflows from a single repository. Perfect to share reusable workflows monorepos that are interconnected but that require separate versioning.

> [!IMPORTANT]
> While WIRE is born to manage multiple reusable workflows in a single repository, it can also be used to manage versioning and releases for a single workflow or action. Keep reading for details!

## Problem It Solves

When you distribute multiple reusable GitHub Workflows, managing their versions can get tricky.

Common approaches and their drawbacks:

- **Store all workflows in the same repository and version them together**
  - A breaking change in one workflow forces a major version bump for all workflows (often unnecessary)

- **Keep every workflow in its own repository**
  - Harder to maintain, share code, and discover
  - When a change affects multiple workflows, you have to coordinate releases across multiple repositories

**WIRE offers a middle ground:**

- Keep all workflows in a single repository for easy maintenance and sharing
- **Independent versioning** per workflow (e.g., `workflow-a` at v2.1.0, `workflow-b` at v1.0.3)
- **Prefixed tags** like `workflow-a/v2.1.0` and `workflow-b/v1.0.3`
- **Floating major version tags** like `workflow-a/v2` for easy consumption
- **Batch releases** to release multiple workflows at once
- **Single source of truth** for all versions in one JSON file

---

## Features

- Release single, multiple, or all workflows at once
- Configurable tag patterns (`{name}/v{version}`, `v{version}-{name}`, etc.)
- Floating major version tags (auto-updated on each release) - this way consumers can always point to the latest major version
- Configurable version file path
- Customizable commit messages
- Fail-fast validation before any changes
- Detailed outputs for downstream steps
- Job summary with release details

---

## How to use it

### Quick start

#### 1. Create a versions file

Create `workflow-versions.json` (name and path customisable, see [inputs](#inputs) ) in your repository root:

```json
{
  "workflow-a": "1.0.0",
  "workflow-b": "1.0.0"
}
```

> [!IMPORTANT]
> The versions file is mandatory, WIRE uses it to track the current versions of your workflows. Explanation [here](#versions-file).

#### 2. Add a release workflow

```yaml
name: Release Workflows

on:
  workflow_dispatch:
    inputs:
      workflows:
        description: "Workflows to release (comma-separated or 'all')"
        required: true
        type: string
      bump-type:
        description: "Version bump type"
        required: true
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v6

      - name: Release
        uses: albertodeago/wire@v1
        with:
          workflows: ${{ inputs.workflows }}
          bump-type: ${{ inputs.bump-type }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

---

### Inputs

| Input                    | Description                                                | Required | Default |
|--------------------------|------------------------------------------------------------|----------|---------|
| `workflows`              | Workflows to release (comma-separated names, or `'all'`)   | true     | - |
| `bump-type`              | Version bump type: `patch`, `minor`, or `major`            | true     | - |
| `versions-file`          | Path to JSON file tracking workflow versions               | false    | `workflow-versions.json` |
| `tag-pattern`            | Tag pattern. Must include `{version}`. `{name}` is required for multiple workflows, optional for single workflow | false    | `{name}/v{version}` |
| `github-token`           | GitHub token for pushing commits and tags                  | true     | - |
| `git-user-name`          | Git user name for commits                                  | false    | `github-actions[bot]`|
| `git-user-email`         | Git user email for commits                                 | false    | `github-actions[bot]@users.noreply.github.com` |
| `commit-message-pattern` | Commit message pattern. Use `{workflows}` placeholder      | false    | `chore({workflows}): release new versions` |

---

### Outputs

| Output     | Description                                           | Example |
|------------|-------------------------------------------------------|---------|
| `released` | JSON object mapping workflow names to new versions    | `{"workflow-a":"1.2.0","workflow-b":"2.0.0"}` |
| `tags`     | JSON array of all created tags (version + major tags) | `["workflow-a/v1.2.0","workflow-a/v1","workflow-b/v2.0.0","workflow-b/v2"]` |

---

### Examples

#### Release a single workflow (in a repo that contains multiple workflows)

```yaml
- uses: albertodeago/wire@v1
  with:
    workflows: "my-workflow"
    bump-type: "patch"
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

#### Release multiple workflows

```yaml
- uses: albertodeago/wire@v1
  with:
    workflows: "workflow-a, workflow-b, workflow-c"
    bump-type: "minor"
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

#### Release all workflows

```yaml
- uses: albertodeago/wire@v1
  with:
    workflows: "all"
    bump-type: "patch"
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

#### Custom tag pattern

```yaml
- uses: albertodeago/wire@v1
  with:
    workflows: "my-lib"
    bump-type: "major"
    tag-pattern: "v{version}-{name}"
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

#### Single-workflow repository (no name prefix)

For repositories with a single action/workflow, you can omit `{name}` from the tag pattern to get clean tags like `v1.0.0` and `v1`:

```yaml
- uses: albertodeago/wire@v1
  with:
    workflows: "my-action"
    bump-type: "patch"
    tag-pattern: "v{version}"
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

> [!TIP]
> This is actually how WIRE itself is published

#### Custom versions file location

```yaml
- uses: albertodeago/wire@v1
  with:
    workflows: "all"
    bump-type: "patch"
    versions-file: "config/versions.json"
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

#### Using outputs in downstream steps

```yaml
- name: Release
  id: release
  uses: albertodeago/wire@v1
  with:
    workflows: "all"
    bump-type: "patch"
    github-token: ${{ secrets.GITHUB_TOKEN }}

- name: Use outputs
  run: |
    echo "Released: ${{ steps.release.outputs.released }}"
    echo "Tags: ${{ steps.release.outputs.tags }}"
```

#### Creating GitHub Releases

WIRE focuses on versioning and tagging. To also create GitHub Releases, combine it with a release action (this is just an example):

```yaml
- name: Release
  id: wire
  uses: albertodeago/wire@v1
  with:
    workflows: "my-workflow"
    bump-type: "patch"
    github-token: ${{ secrets.GITHUB_TOKEN }}

- name: Create GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    tag_name: ${{ fromJSON(steps.wire.outputs.tags)[0] }}
    name: ${{ fromJSON(steps.wire.outputs.tags)[0] }}
    body: |
      ## Released
      ${{ steps.wire.outputs.released }}
    generate_release_notes: true
```

---

## Versions File

The action expects a simple JSON object mapping workflow names to their current [semver](https://semver.org/) versions:

```json
{
  "workflow-a": "1.2.3",
  "workflow-b": "0.5.0",
  "workflow-c": "2.0.0"
}
```

<details>
<summary>

### Design Decision: JSON File vs Git Tags as Version Source
</summary>

This action uses a **JSON file** to track component versions rather than deriving versions from existing Git tags via GitHub API.

### Alternatives Considered

| Approach               | Description |
|------------------------|-------------|
| **JSON File** (chosen) | Store versions in a committed file (e.g., `versions.json`) |
| **Git Tags via API**   | Query GitHub API to find latest tag per component |
| **Git Tags via CLI**   | Use `git tag -l` locally (requires `fetch-depth: 0`) |

### Comparison

| Aspect                | JSON File                     | Git Tags (API)                    | Git Tags (CLI)        |
|-----------------------|-------------------------------|----------------------------------|------------------------|
| Speed                 | ✅ Fast (local read)          | ❌ Slow (API calls, pagination)   | ⚠️ Medium             |
| Clone requirements    | ✅ Shallow clone OK           | ✅ Shallow clone OK               | ❌ Needs `fetch-depth: 0` |
| Visibility            | ✅ Easy to see all versions   | ❌ Must query/parse tags          | ❌ Must run git commands |
| Merge conflicts       | ⚠️ Possible                   | ✅ None                           | ✅ None               |
| Extra commit          | ⚠️ Yes (update file)          | ✅ No                             | ✅ No                 |
| First release         | ⚠️ Must add entry first       | ✅ Auto (starts at 0.0.0)         | ✅ Auto               |
| Rate limits           | ✅ None                       | ⚠️ GitHub API limits              | ✅ None               |
| "all" keyword         | ✅ Read keys from file        | ⚠️ Discover from tags             | ⚠️ Discover from tags |

### Rationale

I chose the **JSON file approach** because:

1. **Simplicity** - No complex tag parsing logic, no API pagination handling
2. **Speed** - Local file read is instant vs. multiple API calls for repos with many tags
3. **Transparency** - All versions visible at a glance in one file
4. **Reliability** - No network dependencies, no rate limits
5. **Shallow clones** - Works with default `actions/checkout` (no `fetch-depth: 0` needed, possible problem with huge repos histories)
6. **Explicit component list** - The JSON keys define what can be released; no risk of accidentally matching unrelated tags

The tradeoff (extra commit + potential merge conflicts) I think is an acceptable trade-off considering the benefits above.

</details>

---

## What the Action Does

When triggered, WIRE will:

1. **Validate inputs** - Check bump type, tag pattern, and requested workflows
2. **Read versions file** - Load current versions from the JSON file
3. **Calculate new versions** - Bump versions according to semver rules
4. **Update versions file** - Write new versions back to the JSON file
5. **Commit changes** - Create a commit with the updated versions file
6. **Push commit** - Push the commit to the repository
7. **Create and push tags** - Create version tags (e.g., `workflow-a/v1.2.0`) and floating major tags (e.g., `workflow-a/v1`)

---

## Requirements

| Requirement                    | Why                                                   |
|--------------------------------|-------------------------------------------------------|
| `actions/checkout@v6`          | Needed to access the versions file and enable pushing |
| `permissions: contents: write` | Required to push commits and tags                     |
| A versions JSON file           | Tracks current versions of all workflows              |

---

<details>
<summary>

## Development

</summary>

### Setup

```bash
npm install
```

### Testing

```bash
npm test
```

### Building

The action must be compiled before committing changes:

```bash
npm run build
```

This uses `@vercel/ncc` to bundle the TypeScript code into a single `dist/index.js` file that GitHub Actions can execute.

**Important:** Always commit the `dist/` folder after making code changes.

### Releasing a New Version

Wire is itself released using WIRE!

To release a new version, trigger the `Release Workflows` workflow from the Actions tab.

#### If shit happens

Release it manually by:

**Create and push tags**:
First make changes, build, and commit them (dist included, and remember to update the changelog).
Then create a version tag and push it:

```bash
# Create version tag
git tag v1.0.0
git push origin v1.0.0

# Update floating major tag
git tag -f v1
git push origin -f v1
```

Alternatively, you can use the Github Releases interface to create a new release, which will automatically create and push the corresponding tags.

</details>

---

## License

MIT
