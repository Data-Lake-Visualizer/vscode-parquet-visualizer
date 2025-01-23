// package.release.config.js
module.exports = {
    branches: ['master', 'develop'],
    plugins: [
        '@semantic-release/commit-analyzer',
        [
            'semantic-release-vsce',
            {
                packageVsix: true,
                publish: false, // no-op since we use semantic-release-stop-before-publish
            },
        ],
        'semantic-release-stop-before-publish',
    ],
}
