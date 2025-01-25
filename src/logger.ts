/**
 * This file manages the logger's state.
 */
import { ExtensionContext, OutputChannel, window } from 'vscode'
import { IChildLogger, IVSCodeExtLogger } from '@vscode-logging/types'
import { NOOP_LOGGER } from '@vscode-logging/wrapper'
import { logFolder, logPanel, logLevel } from './settings'
import { getExtensionLogger } from '@vscode-logging/logger'
import { EXTENSION_NAME } from './constants'
// On file load we initialize our logger to `NOOP_LOGGER`
// this is done because the "real" logger cannot be initialized during file load.
// only once the `activate` function has been called in extension.ts
// as the `ExtensionContext` argument to `activate` contains the required `logPath`
let loggerImpel: IVSCodeExtLogger = NOOP_LOGGER
let loggerPanel: OutputChannel | undefined = undefined

export function getLogger(): IChildLogger {
    return loggerImpel
}

function setLogger(newLogger: IVSCodeExtLogger): void {
    loggerImpel = newLogger
}

function getPanel(name: string): OutputChannel {
    if (!loggerPanel) {
        loggerPanel = window.createOutputChannel(name)
    }
    return loggerPanel
}

export function initLogger(context?: ExtensionContext): void {
    const loggingLevel = logLevel()
    const loggingFolder = logFolder()
    const isLoggingPanel = logPanel()

    setLogger(
        getExtensionLogger({
            extName: EXTENSION_NAME,
            level: loggingLevel,
            logPath: loggingFolder || context?.logUri.fsPath,
            logOutputChannel: isLoggingPanel
                ? getPanel(EXTENSION_NAME)
                : undefined,
            logConsole: process.env.LOG_TO_CONSOLE === 'true',
        })
    )
}
