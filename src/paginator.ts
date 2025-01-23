export interface SortObject {
    direction: string
    field: string
}

export interface QueryObject {
    pageNumber: number
    pageSize: number
    isPageSizeAll?: boolean
    sort?: SortObject
    queryString?: string
    searchString?: string
}

export abstract class Paginator {
    protected currentPage: number = 1
    public totalItems: number
    protected totalPages: number

    constructor(totalItems: number) {
        this.totalItems = totalItems
    }

    abstract getPage(query: QueryObject): Promise<any[]>

    abstract getTotalPages(pageSize: number): number

    protected calculateOffset(pageNumber: number, pageSize: number): number {
        return (pageNumber - 1) * pageSize
    }

    async nextPage(query: QueryObject): Promise<any[]> {
        this.totalPages = this.getTotalPages(query.pageSize)

        if (
            this.totalPages !== undefined &&
            this.currentPage >= this.totalPages
        ) {
            throw new Error('No more pages available.')
        }
        this.currentPage += 1
        return this.getItems(query)
    }

    async previousPage(query: QueryObject): Promise<any[]> {
        this.totalPages = this.getTotalPages(query.pageSize)

        if (this.currentPage <= 1) {
            throw new Error('Already on the first page.')
        }
        this.currentPage -= 1
        return this.getItems(query)
    }

    async firstPage(query: QueryObject): Promise<any[]> {
        this.totalPages = this.getTotalPages(query.pageSize)

        this.currentPage = 1
        return this.getItems(query)
    }

    async lastPage(query: QueryObject): Promise<any[]> {
        this.totalPages = this.getTotalPages(query.pageSize)

        this.currentPage = this.totalPages

        return this.getItems(query)
    }

    async gotoPage(query: QueryObject): Promise<any[]> {
        this.totalPages = this.getTotalPages(query.pageSize)

        if (query.pageNumber === undefined) {
            query.pageNumber = this.getPageNumber()
        }
        if (query.pageNumber > this.totalPages) {
            this.calculateNewPageNumber(query.pageSize)
            query.pageNumber = this.getPageNumber()
        }

        if (
            query.pageNumber < 1 ||
            (this.totalPages !== undefined &&
                query.pageNumber > this.totalPages)
        ) {
            // throw new Error("Invalid page number.");
        }
        this.currentPage = query.pageNumber
        return this.getItems(query)
    }

    async getItems(query: QueryObject): Promise<any[]> {
        return this.getPage(query)
    }

    getCurrentPage(query: QueryObject) {
        this.calculateNewPageNumber(query.pageSize)

        return this.getPage(query)
    }

    getPageNumber() {
        return this.currentPage
    }

    calculateNewPageNumber(newPageSize: number): void {
        if (newPageSize === undefined) {
            this.currentPage = 1
        } else {
            // Calculate the zero-based index of the first item on the current page
            const firstItemIndex = (this.currentPage - 1) * newPageSize

            // Calculate the new page number
            const newPageNumber = Math.floor(firstItemIndex / newPageSize) + 1

            this.currentPage = newPageNumber
        }
    }
}
