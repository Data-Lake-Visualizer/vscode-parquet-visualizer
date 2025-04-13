// worker.ts
import { parentPort, workerData } from 'worker_threads'
import * as comlink from 'comlink'
import nodeEndpoint from 'comlink/dist/umd/node-adapter'

import * as os from 'os'
import { URI } from 'vscode-uri'
import * as exceljs from 'exceljs'
import { Type } from 'apache-arrow'

import { Paginator, QueryObject } from './paginator'
import { DuckDBBackend } from './duckdb-backend'
import { DuckDBPaginator } from './duckdb-paginator'
import {
    createHeadersFromData,
    replacePeriodWithUnderscoreInKey,
    getPageCountFromInput,
} from './util'
import { DateTimeFormatSettings } from './types'
import * as constants from './constants'
import { AWSProfile } from './pro/aws/aws-profile-helper'
// import { getLogger } from './logger'

if (!parentPort) {
    throw new Error('InvalidWorker')
}

const QUERY_RESULT_TABLE_NAME = 'query_result'
const FILTERED_QUERY_RESULT_TABLE_NAME = 'filtered_query_result'

class QueryHelper {
    paginator: Paginator
    backend: DuckDBBackend
    rowCount: number
    tableName: string
    filteredTableName: string
    tabName: string
    readFromFile: boolean

    constructor(backend: DuckDBBackend, tabName: string) {
        this.backend = backend
        this.tableName = QUERY_RESULT_TABLE_NAME
        this.filteredTableName = FILTERED_QUERY_RESULT_TABLE_NAME
        this.tabName = tabName
        this.readFromFile = tabName === constants.REQUEST_SOURCE_DATA_TAB
    }

    async getPage(message: any) {
        // getLogger().info(`QueryHelper.getPage()`)
        let query: QueryObject = {
            pageSize: message.pageSize,
            pageNumber: message.pageNumber,
            sort: message.sort,
            searchString: message.searchString,
        }

        let result
        if (message.type === 'nextPage') {
            result = await this.paginator.nextPage(query)
        } else if (message.type === 'prevPage') {
            result = await this.paginator.previousPage(query)
        } else if (message.type === 'firstPage') {
            result = await this.paginator.firstPage(query)
        } else if (message.type === 'lastPage') {
            result = await this.paginator.lastPage(query)
        } else if (message.type === 'currentPage') {
            result = await this.paginator.gotoPage(query)
        } else {
            throw Error(`Unknown message type: ${message.type}`)
        }

        const values = replacePeriodWithUnderscoreInKey(result)
        const headers = createHeadersFromData(values)

        return {
            headers: headers,
            result: values,
            rowCount: this.rowCount,
        }
    }

    async query(queryObject: QueryObject) {
        // getLogger().info(`QueryHelper.query()`)
        let query = this.formatQueryString(queryObject.queryString)

        await this.backend.query(
            `CREATE OR REPLACE TABLE ${this.tableName} AS 
            ${query}
        `
        )

        const queryResult = await this.backend.query(
            `SELECT COUNT(*) AS count FROM ${this.tableName}`
        )

        if (this.tabName === constants.REQUEST_SOURCE_QUERY_TAB) {
            this.rowCount = Number(queryResult[0]['count'])
        } else {
            // NOTE: Data Tab
            if (this.backend.extensionName === constants.CSV_NAME_EXTENSION) {
                this.rowCount = this.backend.rowCount
            } else {
                this.rowCount = Number(this.backend.metadata[0]['num_rows'])
            }
        }

        this.paginator = new DuckDBPaginator(
            this.backend,
            this.tableName,
            this.rowCount,
            this.readFromFile
        )

        const result = await this.paginator.firstPage(queryObject)
        const values = replacePeriodWithUnderscoreInKey(result)
        const headers = createHeadersFromData(values)

        const querySchemaResult = await this.backend.query(`DESCRIBE ${query}`)

        return {
            headers: headers,
            result: values,
            schema: querySchemaResult,
            rowCount: this.rowCount,
        }
    }

    async search(message: any) {
        // getLogger().info(`QueryHelper.search()`)
        let schemaQuery = `
        SELECT * FROM ${this.tableName}
        `
        const searchString = message.query.searchString

        let tableName = ''
        let query = ''
        if (searchString === undefined || searchString === '') {
            tableName = this.tableName
            query = schemaQuery
        } else {
            tableName = this.filteredTableName
            query = `
                CREATE OR REPLACE TABLE ${this.filteredTableName} AS ${schemaQuery}
            `
        }

        if (searchString && searchString !== '') {
            const querySchemaResult = await this.backend.query(
                `DESCRIBE ${schemaQuery}`
            )
            const whereClause = querySchemaResult
                .map((col) =>
                    col.column_type === 'VARCHAR'
                        ? `"${col.column_name}" LIKE '%${searchString}%'`
                        : `CAST("${col.column_name}" AS TEXT) LIKE '%${searchString}%'`
                )
                .join(' OR ')

            query += ` WHERE ${whereClause}`
        }

        if (message.query.sort) {
            query += `
          ORDER BY "${message.query.sort.field}" ${message.query.sort.direction.toUpperCase()}
      `
        }

        await this.backend.query(query)

        const queryResult = await this.backend.query(
            `SELECT COUNT(*) AS count FROM ${tableName}`
        )

        this.rowCount = Number(queryResult[0]['count'])

        const readFromFile = false
        this.paginator = new DuckDBPaginator(
            this.backend,
            tableName,
            this.rowCount,
            readFromFile
        )

        const queryObject: QueryObject = {
            pageNumber: 1,
            pageSize: message.query.pageSize,
        }

        const result = await this.paginator.firstPage(queryObject)
        const values = replacePeriodWithUnderscoreInKey(result)
        const headers = createHeadersFromData(values)

        return {
            headers: headers,
            result: values,
            rowCount: this.rowCount,
        }
    }

    private async createEmptyExcelFile(filePath: string) {
        // getLogger().info(`QueryHelper.createEmptyExcelFile()`)
        const workbook = new exceljs.Workbook()
        workbook.addWorksheet('Sheet1')

        await workbook.xlsx.writeFile(filePath)
    }

    private formatQueryString(query: string = ''): string {
        const pattern = /FROM data/i

        if (!pattern.test(query)) {
            throw new Error("Query string must contain 'FROM data'")
        }

        const path = this.backend.getPathForQuery(this.backend.uri);
        const readFn = this.backend.getReadFunctionByFileType();

        return query.replace(
            pattern,
            `
      FROM ${readFn}
      ('${path}')
    `
        )
    }

    async export(message: any) {
        // getLogger().info(`QueryHelper.export()`)
        const exportType = message.exportType
        const savedPath = message.savedPath

        let tableName
        if (message.tabName === constants.REQUEST_SOURCE_SCHEMA_TAB) {
            tableName = 'schema_result'

            const path = this.backend.getPathForQuery(this.backend.uri);
            const readFn = this.backend.getReadFunctionByFileType();
            const query = `
                CREATE TABLE ${tableName} AS SELECT * FROM (
                    DESCRIBE SELECT * FROM ${readFn}('${path}')
                )
            `
            await this.backend.query(query)
        } else {
            tableName = this.tableName
        }

        let query = ''
        let subQuery = `
      SELECT * FROM ${tableName}
    `

        if (message.searchString && message.searchString !== '') {
            const schema = this.backend.arrowSchema
            const whereClause = schema.fields
                .map((col) =>
                    col.typeId === Type.Utf8 || col.typeId === Type.LargeUtf8
                        ? `"${col.name}" LIKE '%${message.searchString}%'`
                        : `CAST("${col.name}" AS TEXT) LIKE '%${message.searchString}%'`
                )
                .join(' OR ')

            subQuery += ` WHERE ${whereClause}`
        }

        if (message.sort) {
            subQuery += `
          ORDER BY "${message.sort.field}" ${message.sort.direction.toUpperCase()}
      `
        }

        if (exportType === 'csv') {
            query = `COPY (${subQuery}) TO '${savedPath}' WITH (HEADER, DELIMITER ',');`
        } else if (exportType === 'json') {
            query = `COPY (${subQuery}) TO '${savedPath}' (FORMAT JSON, ARRAY true);`
        } else if (exportType === 'ndjson') {
            query = `COPY (${subQuery}) TO '${savedPath}' (FORMAT JSON, ARRAY false);`
        } else if (exportType === 'parquet') {
            query = `COPY (${subQuery}) TO '${savedPath}' (FORMAT PARQUET);`
        } else if (exportType === 'excel') {
            // NOTE: The spatial extension can't export STRUCT types.

            // Get the schema of the table
            const schemaQuery = `
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = '${tableName}'
      `
            const schema = await this.backend.query(schemaQuery)

            const unsignedIntegers = [
                'UTINYINT',
                'USMALLINT',
                'UINTEGER',
                'UBIGINT',
                'UHUGEINT',
            ]
            // Build the SELECT query
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const columns = schema.map(({ column_name, data_type }) => {
                if (data_type.includes('STRUCT')) {
                    return `TO_JSON("${column_name}") AS ${column_name}`
                }

                if (unsignedIntegers.includes(data_type)) {
                    return `CAST("${column_name}" AS BIGINT) AS ${column_name}`
                }
                return `"${column_name}"`
            })

            let subQuery = `SELECT ${columns.join(', ')} FROM ${this.tableName}`

            if (message.searchString && message.searchString !== '') {
                const schema = this.backend.arrowSchema
                const whereClause = schema.fields
                    .map((col) =>
                        col.typeId === Type.Utf8 ||
                        col.typeId === Type.LargeUtf8
                            ? `"${col.name}" LIKE '%${message.searchString}%'`
                            : `CAST("${col.name}" AS TEXT) LIKE '%${message.searchString}%'`
                    )
                    .join(' OR ')

                subQuery += ` WHERE ${whereClause}`
            }

            if (message.sort) {
                subQuery += `
            ORDER BY "${message.sort.field}" ${message.sort.direction.toUpperCase()}
        `
            }

            query = `
        COPY (${subQuery}) TO '${savedPath}' (FORMAT GDAL, DRIVER 'xlsx');
      `
        }

        if (os.platform() === 'win32') {
            await this.createEmptyExcelFile(savedPath)
            const tmpPath = savedPath.replace(/([^\\]+)\.xlsx$/, 'tmp_$1.xlsx')
            await this.createEmptyExcelFile(tmpPath)
        }

        await this.backend.query(query)

        return savedPath
    }
}

export class BackendWorker {
    queryHelper: QueryHelper

    private constructor(backend: DuckDBBackend, tabName: string) {
        this.queryHelper = new QueryHelper(backend, tabName)
    }

    static async create(
        tabName: string,
        uri: URI,
        dateTimeFormatSettings: DateTimeFormatSettings,
        awsConnection?: AWSProfile,
        region?: string,
    ) {
        // getLogger().info(`BackendWorker.create()`)
        const backend = await DuckDBBackend.createAsync(
            uri,
            dateTimeFormatSettings,
            awsConnection,
            region
        )
        // await backend.initialize()

        return new BackendWorker(backend, tabName)
    }

    public async init(): Promise<void> {
        // getLogger().info(`BackendWorker.init()`)
        await this.queryHelper.backend.initialize()
    }

    public exit(): void {
        // getLogger().info(`BackendWorker.exit()`)
        return process.exit()
    }

    async query(message: any) {
        const queryObject: QueryObject = {
            pageNumber: 1,
            pageSize: message.query.pageSize,
            queryString: message.query.queryString,
        }
        const { headers, result, schema, rowCount } =
            await this.queryHelper.query(queryObject)

        const pageNumber = 1
        const pageCount = getPageCountFromInput(
            message.query.pageSize,
            rowCount
        )

        return {
            schema: schema,
            result: result,
            headers: headers,
            type: message.source,
            pageNumber: pageNumber,
            pageCount: pageCount,
            rowCount: rowCount,
            pageSize: message.query.pageSize,
        }
    }

    async search(message: any) {
        // getLogger().info(`BackendWorker.search()`)
        const { headers, result, rowCount } =
            await this.queryHelper.search(message)

        const pageCount = getPageCountFromInput(
            message.query.pageSize,
            rowCount
        )
        const pageNumber = 1

        const type = 'search'
        return {
            result: result,
            headers: headers,
            type: type,
            pageNumber: pageNumber,
            pageCount: pageCount,
            rowCount: rowCount,
            pageSize: message.query.pageSize,
        }
    }

    async getPage(message: any) {
        // getLogger().info(`BackendWorker.getPage()`)
        const { headers, result, rowCount } =
            await this.queryHelper.getPage(message)

        const pageCount = getPageCountFromInput(message.pageSize, rowCount)

        return {
            result: result,
            headers: headers,
            type: 'paginator',
            pageCount: pageCount,
            rowCount: rowCount,
            pageSize: message.pageSize,
        }
    }

    async export(message: any) {
        // getLogger().info(`BackendWorker.export()`)
        const exportPath = await this.queryHelper.export(message)
        return {
            type: 'exportQueryResults',
            path: exportPath,
        }
    }
}

;(async () => {
    const uri = workerData.uri
    const parsedUri = URI.from({
        scheme: uri.scheme,
        authority: uri.authority,
        fragment: uri.fragment,
        path: uri.path,
        query: uri.query
    })
    workerData.uri
    const worker = await BackendWorker.create(
        workerData.tabName,
        parsedUri,
        workerData.dateTimeFormatSettings,
        workerData?.awsConnection,
        workerData?.region,
    )

    comlink.expose(worker, nodeEndpoint(parentPort))
})()
