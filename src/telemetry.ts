import * as vscode from 'vscode'
import TelemetryReporter, {
    TelemetryEventProperties,
} from '@vscode/extension-telemetry'

export class TelemetryManager {
    private static _reporter: TelemetryReporter
    private static isTelemetryEnabled: boolean = vscode.env.isTelemetryEnabled

    /**
     * Initializes the telemetry reporter if it hasn't been initialized.
     * Pushes it to the extension context's subscriptions for cleanup.
     * @param connectionString - Your Application Insights instrumentation key.
     * @param context - The extension context for managing subscriptions.
     */
    public static initialize(
        connectionString: string,
        context: vscode.ExtensionContext
    ) {
        if (!this._reporter) {
            this._reporter = new TelemetryReporter(connectionString)
            context.subscriptions.push(this._reporter)

            // Listen to telemetry enablement changes
            context.subscriptions.push(
                vscode.env.onDidChangeTelemetryEnabled((isEnabled) => {
                    this.handleTelemetryChange(isEnabled)
                })
            )
        }
    }

    private static addCommonProperties(
        properties: { [key: string]: string } | undefined
    ): { [key: string]: string } {
        let annotatedProperties: { [key: string]: string } = properties ?? {}

        annotatedProperties['appName'] = vscode.env.appName
        annotatedProperties['theme'] =
            vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light
                ? 'light'
                : 'dark'

        return annotatedProperties
    }

    /**
     * Sends a telemetry event if telemetry is enabled.
     * @param eventName - Name of the telemetry event.
     * @param properties - Additional properties for the event.
     * @param measurements - Numeric measurements for the event.
     */
    public static sendEvent(
        eventName: string,
        properties?: { [key: string]: string },
        measurements?: { [key: string]: number }
    ): void {
        try {
            if (this.isTelemetryEnabled) {
                const annotatedProperties =
                    TelemetryManager.addCommonProperties(properties)
                this._reporter?.sendTelemetryEvent(
                    eventName,
                    annotatedProperties,
                    measurements
                )
            } else {
                console.log('Telemetry is not enabled')
            }
        } catch (e) {
            console.error(e)
        }
    }

    /**
     * Handles telemetry enablement changes.
     * @param isEnabled - The new telemetry enablement state.
     */
    private static handleTelemetryChange(isEnabled: boolean): void {
        this.isTelemetryEnabled = isEnabled
        console.log(
            `Telemetry enabled state changed: ${this.isTelemetryEnabled}`
        )
    }

    /**
     * Disposes of the telemetry reporter (useful for testing or manual cleanup).
     */
    static async dispose() {
        if (this._reporter) {
            await this._reporter.dispose()
        }
    }
}
