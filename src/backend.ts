import * as path from 'path'

import { Schema, Field, Type } from 'apache-arrow'
import * as vscode from 'vscode'
import date from 'date-and-time'

import { DateTimeFormatSettings } from './types'
import * as constants from './constants'
// import { AWSProfile } from './pro/aws/aws-profile-helper'

export abstract class Backend {
    public uri: vscode.Uri
    public extensionName: string
    public arrowSchema: Schema
    public duckDbSchema: any
    protected metadata: any

    private dateTimeFormat: DateTimeFormatSettings

    public constructor(
        uri: vscode.Uri,
        dateTimeFormat: DateTimeFormatSettings
    ) {
        this.uri = uri
        this.extensionName = path.extname(this.uri.path)
        this.dateTimeFormat = dateTimeFormat
    }

    static createAsync(
        uri: vscode.Uri,
        dateTimeFormat: DateTimeFormatSettings
        // currentConnection: AWSProfile
    ): Promise<any> {
        throw new Error('Method not implemented')
    }

    abstract initialize(): Promise<void>

    // TODO: define a type (interface) for the return type.
    public getSchema(): any {
        return this.duckDbSchema
    }

    abstract getSchemaImpl(): Promise<any>

    public getMetaData(): any {
        if (this.extensionName === constants.CSV_NAME_EXTENSION ||
            this.extensionName === constants.AVRO_NAME_EXTENSION) {
            return []
        }

        return [
            {
                key: 'file_name',
                value: this.metadata[0]['file_name'],
            },
            {
                key: 'created_by',
                value: this.metadata[0]['created_by'],
            },
            {
                key: 'num_rows',
                value: Number(this.metadata[0]['num_rows']),
            },
            {
                key: 'num_row_groups',
                value: Number(this.metadata[0]['num_row_groups']),
            },
            {
                key: 'format_version',
                value: Number(this.metadata[0]['format_version']),
            },
            {
                key: 'encryption_algorithm',
                value: Number(this.metadata[0]['encryption_algorithm']),
            },
            {
                key: 'footer_signing_key_metadata',
                value: Number(this.metadata[0]['footer_signing_key_metadata']),
            },
        ]
    }

    abstract getMetaDataImpl(): Promise<any>

    abstract getRowCount(): number

    public async query(query: any): Promise<any[]> {
        // console.log(query)
        const startTime = performance.now()

        const queryResult = await this.queryImpl(query)
        const result = Object.entries(queryResult).map(([k, v]) => {
            return this.convertObjectsToJSONStrings(
                this.convertBigIntToString(k, v)
            )
        })

        const endTime = performance.now()
        const time = endTime - startTime
        console.log(`Query resolve time: ${time} msec.`)

        return result
    }

    protected abstract queryImpl(query: any): Promise<any[]>

    abstract dispose(): any

    private convertObjectsToJSONStrings(obj: any) {
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    obj[key] = JSON.stringify(obj[key])
                }
            }
        }
        return obj
    }

    private convertBigIntToString(key: string, obj: any): any {
        if (Array.isArray(obj)) {
            return Object.entries(obj).map(([key, value]) =>
                this.convertBigIntToString(key, value)
            )
        } else if (obj instanceof Uint8Array) {
            return Array.from(obj.values())
        } else if (obj !== null && typeof obj === 'object') {
            if (obj instanceof Date) {
                const field = this.arrowSchema.fields.find(
                    (f) => f.name === key
                )
                if (field?.typeId === Type.Date && field?.type.unit === 0) {
                    if (this.dateTimeFormat.format === 'ISO8601') {
                        return date.format(obj, 'YYYY-MM-DD', true)
                    } else if (this.dateTimeFormat.format === 'RFC2822') {
                        return date.format(obj, 'ddd, DD MMM YYYY', true)
                    } else {
                        return obj.toDateString()
                    }
                } else {
                    if (this.dateTimeFormat.format === 'ISO8601') {
                        return obj.toISOString()
                    } else if (this.dateTimeFormat.format === 'RFC2822') {
                        return obj.toUTCString()
                    } else {
                        return date.format(
                            obj,
                            this.dateTimeFormat.format,
                            this.dateTimeFormat.useUTC
                        )
                    }
                }
            }

            const newObj: { [key: string]: any } = {}
            for (const [key, value] of Object.entries(obj)) {
                if (obj.hasOwnProperty(key)) {
                    newObj[key] = this.convertBigIntToString(key, value)
                }
            }
            return newObj
        } else if (typeof obj === 'bigint') {
            return obj.toString()
        } else {
            return obj
        }
    }
}
