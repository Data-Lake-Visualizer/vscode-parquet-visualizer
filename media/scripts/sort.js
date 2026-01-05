class Sort {
    constructor(/** @type {Tab} */ tab) {
        this.tab = tab

        this.sortQuery = undefined
    }

    initialize() {
        // console.log("initializeSort()")
        const selectors = `#table-${this.tab.name} .tabulator-col-sorter.tabulator-col-sorter-element`

        const elements = document.querySelectorAll(selectors)
        elements.forEach((e) => {
            e.addEventListener('click', (event) => {
                // Prevent other click listeners from firing
                event.stopPropagation()
                event.stopImmediatePropagation()

                const parentWithClass = event.target.closest(
                    '.tabulator-col.tabulator-sortable'
                )
                const ariaSort = parentWithClass.getAttribute('aria-sort')
                const tabulatorField =
                    parentWithClass.getAttribute('tabulator-field')

                const sortQuery = {
                    field: tabulatorField,
                    dir: ariaSort === 'ascending' ? 'asc' : 'desc',
                }
                this.onSort(sortQuery)
            })
        })

        const resetSortButton = /** @type {HTMLElement} */ (
            document.querySelector(`#reset-sort-${this.tab.name}`)
        )
        resetSortButton.addEventListener('click', () => {
            this.tab.tableWrapper.table.clearSort()
            const sortQuery = undefined

            this.onSort(sortQuery)
        })
    }

    onSort(/** @type {any}*/ query) {
        // console.log(`onSort{${query}}`)
        const resetSortButton = document.querySelector(
            `#reset-sort-${this.tab.name}`
        )
        resetSortButton?.removeAttribute('disabled')

        const selectedOption = this.tab.pagination.getSelectedPageSize()
        let queryString = undefined
        if (this.tab.editor) {
            queryString = this.tab.editor.getTextFromEditor()
        }

        const sortObject = query
            ? {
                  field: query.field,
                  direction: query.dir,
              }
            : undefined

        this.sortQuery = sortObject
        this.tab.tableWrapper.setAlert()

        const searchElement = document.getElementById(
            `input-filter-values-${this.tab.name}`
        )
        const searchString = searchElement.value.trim()
        const selectedOptionValue = selectedOption.innerText.toLowerCase()
        const pageSize =
            selectedOptionValue === 'all' ? undefined : selectedOptionValue

        // TODO: Somehow get this message from a class.
        const msgQuery = {
            queryString: queryString,
            pageNumber: this.tab.pagination.pageNumber,
            pageSize: pageSize,
            sort: sortObject,
            searchString: searchString,
        }

        this.tab.vscode.postMessage({
            type: 'onSort',
            source: this.tab.name,
            query: msgQuery,
        })
    }
}
