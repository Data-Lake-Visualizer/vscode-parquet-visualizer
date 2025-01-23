;(async function () {
    const { exec } = require('child_process')

    const envVars = {
        ...process.env,
        AZURE_APP_INSIGHTS_CONNECTION_STRING:
            process.env.AZURE_APP_INSIGHTS_CONNECTION_STRING,
    }

    if (!envVars.AZURE_APP_INSIGHTS_CONNECTION_STRING) {
        console.error('Build failed. Azure App insights conn string not found')
        process.exit(1)
    }

    function execCommand(command, options) {
        return new Promise((resolve, reject) => {
            exec(command, options, (error, stdout, stderr) => {
                if (error) {
                    console.error(
                        `Error executing ${command}: ${error.message}`
                    )
                    console.error(`$Error code: ${error.code}`)
                    return reject(error)
                }
                if (stderr) {
                    console.error(`Stderr executing ${command}: ${stderr}`)
                }
                console.log(`Stdout executing ${command}: ${stdout}`)
                resolve()
            })
        })
    }

    try {
        if (process.platform !== 'win32') {
            await execCommand('./build.sh', { env: envVars })
        } else {
            console.log('executing build.bat')
            await execCommand('build.bat', { env: envVars })
            console.log('executing build_worker.bat')
            await execCommand('build_worker.bat', { env: envVars })
        }
    } catch (error) {
        console.error('Build failed:', error)
        process.exit(1) // Exit with a non-zero code to signal failure
    }
})()
