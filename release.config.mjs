// semantic-release (the release job in .github/workflows/ci.yml): each push to main that has
// something new tags it v<version> and creates a GitHub Release, and the TestFlight workflow
// uploads the iPhone/iPad and Apple TV apps at that version (docs/release.md).
//
// Pull requests are squash-merged into dev with plain-English titles, so each of those is a patch.
// The pull request that merges dev into main (a merge commit) can ask for more with a
// conventional title: "feat: ..." is a minor version, "feat!: ..." a major one.
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        // A merge commit is read by the title GitHub puts under "Merge pull request #n from ...".
        parserOpts: {
          mergePattern: /^Merge pull request #(\d+) from (.*)$/,
          mergeCorrespondence: ['id', 'source'],
          // "type!:" marks a breaking change, as Conventional Commits 1.0 has it.
          headerPattern: /^(\w*)(?:\((.*)\))?!?: (.*)$/,
          breakingHeaderPattern: /^(\w*)(?:\((.*)\))?!: (.*)$/,
        },
        // The highest rule a commit matches wins; anything else that landed is a patch (a header
        // pattern that matches any text, a leading dot included).
        releaseRules: [
          { breaking: true, release: 'major' },
          { type: 'feat', release: 'minor' },
          { header: '?(.)**', release: 'patch' },
        ],
      },
    ],
    // The release notes are the titles of what landed, as written.
    [
      '@semantic-release/exec',
      {
        generateNotesCmd:
          'git log --no-merges --format="- %s" ${lastRelease.gitHead ? lastRelease.gitHead + ".." : ""}${nextRelease.gitHead}',
      },
    ],
    ['@semantic-release/github', { successComment: false, failComment: false }],
    [
      '@semantic-release/exec',
      { prepareCmd: 'if [ -n "$GITHUB_OUTPUT" ]; then echo "version=${nextRelease.version}" >> "$GITHUB_OUTPUT"; fi' },
    ],
  ],
};
