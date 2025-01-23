import { tableFromIPC } from 'apache-arrow'

import { Paginator, QueryObject } from './paginator'
import { ParquetWasmBackend } from './parquet-wasm-backend'
import { convertToTabulatorData } from './util'

export class ParquetWasmPaginator extends Paginator {
    private db: ParquetWasmBackend // Assume this is your DuckDB connection instance

    constructor(db: any) {
        const totalItems = 10 // TODO: get totalitems of parquet file here.
        super(totalItems)
        this.db = db
    }

    getPage(query: QueryObject): Promise<any[]> {
        const pageCount = this.getTotalPages(query.pageSize)
        if (query.pageNumber > pageCount) {
            throw new RangeError(
                `Page Number ${query.pageNumber} is out of range. Total number of pages are ${pageCount}`
            )
        }

        const rowCount = this.db.parquetFile.metadata().fileMetadata().numRows()
        const startIndex = (query.pageNumber - 1) * query.pageSize
        const endIndex = Math.min(startIndex + query.pageSize - 1, rowCount)
        const limit = endIndex - startIndex

        const processResult = async (): Promise<any[]> => {
            const stream = (
                await this.db.parquetFile.read({
                    offset: startIndex,
                    limit: limit,
                })
            ).intoIPCStream()
            const table = tableFromIPC(stream)
            return convertToTabulatorData(table.toArray())
        }

        return processResult()
    }

    getTotalPages(pageSize: number): number {
        const numberOfRows = this.db.parquetFile
            .metadata()
            .fileMetadata()
            .numRows()
        return Math.ceil(numberOfRows / pageSize)
    }
}
