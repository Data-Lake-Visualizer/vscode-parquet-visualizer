class Pagination {
    constructor(/** @type {Tab} */ tab, /** @type {any} */ parameters) {
        this.tab = tab

        this.enabled = parameters.enabled
        this.defaultPageSizes = parameters.defaultPageSizes

        this.pageCount = parameters.pageCount
        this.rowCount = parameters.rowCount

        // TODO: Rename to backend/isDuckDB
        this.isQueryable = parameters.isQueryable

        this.pageNumber = 1
        this.pageSize = 1
    }

    getSelectedPageSize() {
        const numRecordsDropdown = /** @type {HTMLSelectElement} */ (
            document.querySelector(`#dropdown-page-size-${this.tab.name}`)
        )
        const selectedIndex = numRecordsDropdown.selectedIndex
        return numRecordsDropdown.options[selectedIndex]
    }

    initialize() {
        // console.log(`initializeFooter(rowCount:${this.rowCount}, requestSource:${this.tabName})`);

        const nextButton = /** @type {HTMLElement} */ (
            document.querySelector(`#btn-next-${this.tab.name}`)
        )
        const prevButton = /** @type {HTMLElement} */ (
            document.querySelector(`#btn-prev-${this.tab.name}`)
        )
        const firstButton = /** @type {HTMLElement} */ (
            document.querySelector(`#btn-first-${this.tab.name}`)
        )
        const lastButton = /** @type {HTMLElement} */ (
            document.querySelector(`#btn-last-${this.tab.name}`)
        )

        const numRecordsDropdown = /** @type {HTMLSelectElement} */ (
            document.querySelector(`#dropdown-page-size-${this.tab.name}`)
        )

        nextButton.addEventListener('click', () => {
            const selectedIndex = numRecordsDropdown.selectedIndex
            const selectedOption = numRecordsDropdown.options[selectedIndex]
            const getSelectedPageSize = selectedOption.innerText.toLowerCase()
            const pageSize =
                getSelectedPageSize === 'all' ? undefined : getSelectedPageSize
            const filterValueInput = /** @type {HTMLElement} */ (
                document.querySelector(`#input-filter-values-${this.tab.name}`)
            )

            this.tab.tableWrapper.setAlert()
            this.pageNumber += 1

            // TODO: create message class
            this.tab.vscode.postMessage({
                type: 'nextPage',
                pageSize: pageSize,
                pageNumber: this.pageNumber,
                sort: this.tab.sort.sortQuery,
                searchString: filterValueInput?.value,
                source: this.tab.name,
            })
        })

        prevButton.addEventListener('click', () => {
            // TODO: DRY/create a class/method
            const selectedIndex = numRecordsDropdown.selectedIndex
            const selectedOption = numRecordsDropdown.options[selectedIndex]
            const getSelectedPageSize = selectedOption.innerText.toLowerCase()
            const pageSize =
                getSelectedPageSize === 'all' ? undefined : getSelectedPageSize
            const filterValueInput = /** @type {HTMLElement} */ (
                document.querySelector(`#input-filter-values-${this.tab.name}`)
            )

            this.tab.tableWrapper.setAlert()
            this.pageNumber -= 1
            this.tab.vscode.postMessage({
                type: 'prevPage',
                pageSize: pageSize,
                pageNumber: this.pageNumber,
                sort: this.tab.sort.sortQuery,
                searchString: filterValueInput?.value,
                source: this.tab.name,
            })
        })

        firstButton.addEventListener('click', () => {
            // TODO: DRY/create a class/method
            const selectedIndex = numRecordsDropdown.selectedIndex
            const selectedOption = numRecordsDropdown.options[selectedIndex]
            const getSelectedPageSize = selectedOption.innerText.toLowerCase()
            const pageSize =
                getSelectedPageSize === 'all' ? undefined : getSelectedPageSize
            const filterValueInput = /** @type {HTMLElement} */ (
                document.querySelector(`#input-filter-values-${this.tab.name}`)
            )
            this.tab.tableWrapper.setAlert()

            this.pageNumber = 1
            this.tab.vscode.postMessage({
                type: 'firstPage',
                pageSize: pageSize,
                pageNumber: this.pageNumber,
                sort: this.tab.sort.sortQuery,
                searchString: filterValueInput?.value,
                source: this.tab.name,
            })
        })

        lastButton.addEventListener('click', () => {
            // TODO: DRY/create a class/method
            const selectedIndex = numRecordsDropdown.selectedIndex
            const selectedOption = numRecordsDropdown.options[selectedIndex]
            const getSelectedPageSize = selectedOption.innerText.toLowerCase()
            const pageSize =
                getSelectedPageSize === 'all' ? undefined : getSelectedPageSize
            const filterValueInput = /** @type {HTMLElement} */ (
                document.querySelector(`#input-filter-values-${this.tab.name}`)
            )

            this.tab.tableWrapper.setAlert()

            this.pageNumber = this.pageCount

            this.tab.vscode.postMessage({
                type: 'lastPage',
                pageSize: pageSize,
                pageNumber: this.pageNumber,
                sort: this.tab.sort.sortQuery,
                searchString: filterValueInput?.value,
                source: this.tab.name,
            })
        })

        numRecordsDropdown.value = `${this.defaultPageSizes[0]}`

        if (this.rowCount <= 10) {
            numRecordsDropdown.setAttribute('disabled', '')
        } else {
            numRecordsDropdown.removeAttribute('disabled')
            numRecordsDropdown.addEventListener('change', (e) => {
                const selectedIndex = numRecordsDropdown.selectedIndex
                const selectedOption = numRecordsDropdown.options[selectedIndex]
                const getSelectedPageSize =
                    selectedOption.innerText.toLowerCase()

                const pageSize =
                    getSelectedPageSize === 'all'
                        ? undefined
                        : getSelectedPageSize

                const filterValueInput = /** @type {HTMLElement} */ (
                    document.querySelector(
                        `#input-filter-values-${this.tab.name}`
                    )
                )

                // https://stackoverflow.com/questions/61809200/default-page-number-on-page-size-change
                // numRecordsDropDownResultTableHasChanged = true
                this.tab.tableWrapper.setAlert()
                if (pageSize === undefined) {
                    this.pageNumber = 1
                } else {
                    this.calcNewPagePageNumerOnPageSizeChange(Number(pageSize))
                    this.pageSize = Number(pageSize)
                }
                this.tab.vscode.postMessage({
                    type: 'changePageSize',
                    data: {
                        pageSize: pageSize,
                        pageNumber: this.pageNumber,
                        sort: this.tab.sort.sortQuery,
                        searchString: filterValueInput?.value,
                        source: this.tab.name,
                    },
                })
            })
        }

        this.updatePageCounterState(this.pageCount)
        this.updateNavigationButtonsState(this.pageCount)
    }

    createOptionHTMLElementsString() {
        let html = ''
        this.defaultPageSizes.forEach((pageSize, idx) => {
            if (idx === 0) {
                html += `<option value="${pageSize}" selected="selected">${pageSize}</option>\n`
            } else {
                html += `<option value="${pageSize}">${pageSize}</option>\n`
            }
        })
        return html
    }

    getFooterHTML() {
        if (!this.enabled) {
            return undefined
        } else {
            const options = this.createOptionHTMLElementsString()
            const footerElement = `<span id="page-counter-${this.tab.name}" class="tabulator-page-counter">
                        <span>
                            <span>Showing</span>
                            <span id="page-current-${this.tab.name}"></span>
                            <span>of</span>
                            <span id="page-count-${this.tab.name}"></span>
                            <span>pages</span>
                        </span>
                    </span>
                    <span class="tabulator-paginator">
                        <label>Page Size</label>
                        <select class="tabulator-page-size" id="dropdown-page-size-${this.tab.name}" aria-label="Page Size" title="Page Size">
                            ${options}
                        </select>
                        <button class="tabulator-page" disabled id="btn-first-${this.tab.name}" type="button" role="button" aria-label="First Page" title="First Page" data-page="first">First</button>
                        <button class="tabulator-page" disabled id="btn-prev-${this.tab.name}" type="button" role="button" aria-label="Prev Page" title="Prev Page" data-page="prev">Prev</button>
                    </span>
                    <button class="tabulator-page" disabled id="btn-next-${this.tab.name}" type="button" role="button" aria-label="Next Page" title="Next Page" data-page="next">Next</button>
                    <button class="tabulator-page" disabled id="btn-last-${this.tab.name}" type="button" role="button" aria-label="Last Page" title="Last Page" data-page="last">Last</button>
            `

            return footerElement
        }
    }

    updateNavigationButtonsState(/** @type {Number} */ amountOfPages) {
        // console.log(`updateNavigationButtonsState(${currentPage}, ${amountOfPages}, ${requestSource})`);

        const nextButton = /** @type {HTMLElement} */ (
            document.querySelector(`#btn-next-${this.tab.name}`)
        )
        const prevButton = /** @type {HTMLElement} */ (
            document.querySelector(`#btn-prev-${this.tab.name}`)
        )
        const firstButton = /** @type {HTMLElement} */ (
            document.querySelector(`#btn-first-${this.tab.name}`)
        )
        const lastButton = /** @type {HTMLElement} */ (
            document.querySelector(`#btn-last-${this.tab.name}`)
        )

        if (!nextButton) {
            return
        }

        if (amountOfPages <= 1) {
            nextButton.setAttribute('disabled', '')
            prevButton.setAttribute('disabled', '')
            firstButton.setAttribute('disabled', '')
            lastButton.setAttribute('disabled', '')
        }

        if (this.pageNumber === amountOfPages) {
            nextButton.setAttribute('disabled', '')
            lastButton.setAttribute('disabled', '')
        }

        if (this.pageNumber > 1) {
            prevButton.removeAttribute('disabled')
            firstButton.removeAttribute('disabled')
        }

        if (this.pageNumber < amountOfPages) {
            nextButton.removeAttribute('disabled')
            lastButton.removeAttribute('disabled')
        }

        if (this.pageNumber === 1) {
            prevButton.setAttribute('disabled', '')
            firstButton.setAttribute('disabled', '')
        }
    }

    updatePageCounterState(/** @type {Number} */ pageCount) {
        // console.log(`updatePageCounterState(pageCount:${pageCount})`);

        const pageCounterSpan = /** @type {HTMLElement} */ (
            document.querySelector(`#page-counter-${this.tab.name}`)
        )
        if (pageCounterSpan) {
            if (pageCount == 0) {
                pageCounterSpan.style.display = 'none'
            } else {
                pageCounterSpan.style.display = 'block'
            }
        }

        const currentPageSpan = /** @type {HTMLElement} */ (
            document.querySelector(`#page-current-${this.tab.name}`)
        )
        const countPageSpan = /** @type {HTMLElement} */ (
            document.querySelector(`#page-count-${this.tab.name}`)
        )

        if (this.isQueryable) {
            if (!currentPageSpan && !countPageSpan) {
            } else {
                currentPageSpan.innerText = this.pageNumber.toString()
                countPageSpan.innerText = pageCount.toString()
            }
        } else if (currentPageSpan && countPageSpan) {
            currentPageSpan.innerText = this.pageNumber.toString()
            countPageSpan.innerText = pageCount.toString()
        }
    }

    updateResultCount(/** @type {Number} */ rowCount) {
        if (this.tab.name === NAME_QUERY_TAB) {
            const resultsCountElement = document.getElementById('query-count')
            resultsCountElement.innerHTML = `<strong>Results</strong> (${rowCount})&nbsp;`
        }
    }

    calcNewPagePageNumerOnPageSizeChange(/** @type {Number} */ newPageSize) {
        // console.log(`calcNewPagePageNumerOnPageSizeChange(${newPageSize})`)
        let nextPageNumber
        if (newPageSize === undefined) {
            nextPageNumber = 1
        } else {
            // Calculate the zero-based index of the first item on the current page
            const firstItemIndex = (this.pageNumber - 1) * this.pageSize

            // Calculate the new page number
            nextPageNumber = Math.floor(firstItemIndex / newPageSize) + 1

            this.pageNumber = nextPageNumber
        }
    }
}
