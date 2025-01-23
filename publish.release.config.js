// publish.release.config.js
module.exports = {
    plugins: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        [
            '@semantic-release/changelog',
            {
                changelogFile: 'CHANGELOG.md',
            },
        ],
        '@semantic-release/git',
        [
            'semantic-release-vsce',
            {
                packageVsix: false,
                publishPackagePath: '*/*.vsix',
            },
        ],
        [
            '@semantic-release/github',
            {
                assets: '*/*.vsix',
            },
        ],
    ],
}
