import os from 'os'

import * as duckdb from 'duckdb-async'
import * as vscode from 'vscode'
import { tableFromIPC, Schema } from 'apache-arrow'

import { Backend } from './backend'
import { DateTimeFormatSettings } from './types'
import * as constants from './constants'
// import { AWSProfile } from './pro/aws/aws-profile-helper'

export class DuckDBBackend extends Backend {
    private db: duckdb.Database
    public arrowSchema: Schema<any>
    public metadata: any
    public rowCount: number

    // private awsProfile: AWSProfile | undefined
    private region: string | undefined

    constructor(
        uri: vscode.Uri,
        dateTimeFormatSettings: DateTimeFormatSettings,
        db: duckdb.Database,
        // awsProfile?: AWSProfile,
        region?: string
    ) {
        super(uri, dateTimeFormatSettings)
        this.db = db
        // this.awsProfile = awsProfile
        this.region = region
    }

    public static override async createAsync(
        uri: vscode.Uri,
        dateTimeFormatSettings: DateTimeFormatSettings,
        // currentConnection?: AWSProfile,
        region?: string
    ) {
        const db = await duckdb.Database.create(':memory:')
        return new DuckDBBackend(
            uri,
            dateTimeFormatSettings,
            db,
            // currentConnection,
            region
        )
    }

    dispose() {}

    public async initialize() {
        const cores = os.cpus().length
        await this.db.all(`
          INSTALL arrow; LOAD arrow;
          INSTALL spatial; LOAD spatial;

          SET threads = ${cores * 2}
        `)
        // if (this.uri.scheme !== 'file') {
        //     const sessionTokenLine = this.awsProfile?.sessionToken
        //         ? `,\n    SESSION_TOKEN '${this.awsProfile.sessionToken}'`
        //         : ''

        //     // TODO: pass region
        //     await this.db.all(`    
        //       CREATE OR REPLACE SECRET secret (
        //             TYPE s3,
        //             KEY_ID '${this.awsProfile?.accessKeyId}',
        //             SECRET '${this.awsProfile?.secretAccessKey}'${sessionTokenLine},
        //             REGION '${this.region}'
        //       );
        //     `)
        // }

        if (this.extensionName === constants.CSV_NAME_EXTENSION) {
            const path = this.getPathForQuery(this.uri)
            const readFn = this.getReadFunctionByFileType()
            const queryResult = await this.db.all(`
          SELECT COUNT(*) 
          FROM ${readFn}('${path}')
        `)
            this.rowCount = Number(queryResult[0]['count_star()'])
            return
        }

        this.metadata = await this.getMetaDataImpl()
        this.rowCount = Number(this.metadata[0]['num_rows'])
    }

    async initializeSchema() {
        const startTime = performance.now()
        try {
            const arrowIpc = await this.db.arrowIPCAll(`
                SELECT * 
                FROM query_result
                LIMIT 1
            `)
            const endTime = performance.now()
            const time = endTime - startTime
            console.log(`GetSchemaImpl() resolve time: ${time} msec.`)

            this.arrowSchema = tableFromIPC(arrowIpc).schema
        } catch (e: any) {
            this.dispose()
            throw e
        }
    }

    getSchemaImpl(): any {
        try {
            return this.db.arrowIPCAll(`
          SELECT * 
          FROM query_result
          LIMIT 1
        `)
        } catch (e: any) {
            this.dispose()
            throw e
        }
    }

    getMetaDataImpl(): Promise<any> {
        try {
            const path = this.getPathForQuery(this.uri)
            return this.db.all(`
          SELECT * 
          FROM parquet_file_metadata('${path}')
        `)
        } catch (e: any) {
            this.dispose()
            throw e
        }
    }

    queryImpl(query: any): Promise<any> {
        return this.db.all(query)
    }

    public getRowCount(): number {
        return this.rowCount
    }

    public getReadFunctionByFileType() {
        if (this.extensionName === constants.CSV_NAME_EXTENSION) {
            return 'read_csv'
        } else if (
            constants.PARQUET_NAME_EXTENSIONS.includes(this.extensionName)
        ) {
            return 'read_parquet'
        } else {
            return 'read_parquet'
        }
    }

    public getPathForQuery(uri: vscode.Uri): string {
        if (uri.scheme === 'file') {
            // Escape backslashes on Windows, if needed
            return uri.fsPath.replace(/\\/g, '/')
        } else if (uri.scheme === 's3') {
            // Example: vscode.Uri.parse('s3://my-bucket/path/to/file.parquet')
            return `s3://${uri.authority}${uri.path}`
        } else {
            throw new Error(`Unsupported URI scheme: ${uri.scheme}`)
        }
    }
}
