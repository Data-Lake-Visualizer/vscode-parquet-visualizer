import os from 'os'

import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api'
import * as vscode from 'vscode'
import { tableFromIPC, Schema } from 'apache-arrow'

import { Backend } from './backend'
import { DateTimeFormatSettings } from './types'
import * as constants from './constants'
import { parseTypeString } from './duckdb-schema-converter'
// import { AWSProfile } from './pro/aws/aws-profile-helper'

export class DuckDBBackend extends Backend {
    private db: DuckDBInstance
    private connection: DuckDBConnection

    public duckDbSchema: any
    public arrowSchema: Schema<any>
    public metadata: any
    public rowCount: number

    // private awsProfile: AWSProfile | undefined
    private region: string | undefined

    constructor(
        uri: vscode.Uri,
        dateTimeFormatSettings: DateTimeFormatSettings,
        db: DuckDBInstance,
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
        const db = await DuckDBInstance.create(':memory:')
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
        this.connection = await this.db.connect()

        const cores = os.cpus().length
        await this.connection.runAndReadAll(`
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
            const reader = await this.connection.runAndReadAll(`
          SELECT COUNT(*) 
          FROM ${readFn}('${path}')
        `)
            const queryResult = reader.getRowObjects()
            this.rowCount = Number(queryResult[0]['count_star()'])
            return
        }

        this.metadata = await this.getMetaDataImpl()
        this.rowCount = Number(this.metadata[0]['num_rows'])
    }

    async initializeSchema() {
        try {
            const reader = await this.connection.runAndReadAll(`
                DESCRIBE SELECT * FROM query_result
            `)
            this.duckDbSchema = reader.getRowObjects()

            // Extend each schema object with converted arrow column type
            this.duckDbSchema = this.duckDbSchema.map((row: any) => {
                const arrowColumnType = parseTypeString(row.column_type)
                return {
                    ...row,
                    arrow_column_type: arrowColumnType,
                    arrow_column_type_json:
                        typeof arrowColumnType === 'string'
                            ? arrowColumnType
                            : JSON.stringify(arrowColumnType),
                }
            })
        } catch (e: any) {
            this.dispose()
            throw e
        }
    }

    getSchemaImpl(): any {}

    async getMetaDataImpl(): Promise<any> {
        try {
            const path = this.getPathForQuery(this.uri)
            const reader = await this.connection.runAndReadAll(`
          SELECT * 
          FROM parquet_file_metadata('${path}')
        `)
            return reader.getRowObjects()
        } catch (e: any) {
            this.dispose()
            throw e
        }
    }

    async queryImpl(query: any): Promise<any> {
        const result = await this.connection.runAndReadAll(query)
        const rows = result.getRowObjectsJson()
        return rows
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
