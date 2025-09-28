// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.

;(function () {
    const vscode = acquireVsCodeApi()

    const requestSourceDataTab = 'dataTab'
    const requestSourceQueryTab = 'queryTab'
    const requestSourceSchemaTab = 'schemaTab'

    const tabManager = new TabManager()
    tabManager.createTab(
        `#table-${requestSourceDataTab}`,
        requestSourceDataTab,
        vscode
    )
    tabManager.createTab(
        `#table-${requestSourceQueryTab}`,
        requestSourceQueryTab,
        vscode
    )
    tabManager.createTab(
        `#table-${requestSourceSchemaTab}`,
        requestSourceSchemaTab,
        vscode
    )

    let metadataTable

    let isQueryAble = false
    let defaultPageSizes
    let settingsAceEditor

    function initialize(/** @type {any} */ tableData) {
        // console.log("initialize()")
        if (tableData) {
            defaultPageSizes = tableData.settings.defaultPageSizes
            if (tableData.requestSource === requestSourceDataTab) {
                initDataTab(
                    tableData.rawData,
                    tableData.headers,
                    tableData.totalPageCount,
                    tableData.totalRowCount,
                    defaultPageSizes,
                    tableData.schema
                )

                if (!tableData.isQueryAble) {
                    document.getElementById('data-tab')?.click()
                }
            } else if (tableData.requestSource === requestSourceQueryTab) {
                settingsAceEditor = {
                    defaultQuery: tableData.settings.defaultQuery,
                    shortCutMapping: tableData.settings.shortCutMapping,
                    theme: tableData.aceTheme,
                    aceEditorCompletions: tableData.aceEditorCompletions,
                }
                initSchemaTab(tableData.schemaTabData, tableData.schema)
                initMetaDataTab(tableData.metaData)

                initQueryTab(
                    tableData.rawData,
                    tableData.headers,
                    tableData.pageCount,
                    tableData.rowCount,
                    defaultPageSizes,
                    tableData.schema,
                    settingsAceEditor
                )
                vscode.postMessage({ type: 'queryTabLoaded' })
            }
        }
    }

    function onCellClick(e, cell) {
        const val = cell.getValue()

        let popupValue = ''
        try {
            const obj = JSON.parse(val)
            popupValue = `<pre>${JSON.stringify(obj, undefined, 4)}</pre>`
        } catch (e) {
            popupValue = val
        }

        cell.popup(popupValue, 'center')
    }

    function onPopupOpenedMetaDataTab(component) {
        const parentContainerId = 'metadata'
        onPopupOpened(parentContainerId, component)
    }

    function containsHTML(str) {
        const htmlTagRegex = /<\/?[a-z][\s\S]*>/i // Matches opening or closing HTML tags
        return htmlTagRegex.test(str)
    }

    function escapeHtml(htmlString) {
        return htmlString
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
    }

    function onPopupOpened(parentContainerId, component) {
        let element = document.getElementsByClassName(
            'tabulator-popup tabulator-popup-container'
        )[0]

        const cellValue = component.getValue()

        let innerHTML = element.innerHTML
        let style = element.style

        // Check if html contains JSON. Make it a little bit wider and horizontally scrollable
        if (innerHTML.includes('pre')) {
            style.width = '400px'
            style.overflowX = 'auto'

            let tab = ''
            if (parentContainerId === 'metadata') {
                tab = 'metadataTab'
            } else if (parentContainerId === 'schema') {
                tab = 'schemaTab'
            } else if (parentContainerId === 'table-queryTab') {
                tab = 'queryTab'
            } else {
                tab = 'dataTab'
            }

            vscode.postMessage({
                type: 'onPopupOpened',
                tab: tab,
            })
        } else {
            innerHTML = cellValue
            if (containsHTML(innerHTML)) {
                element.innerHTML = escapeHtml(innerHTML)
            }
        }

        style.minWidth = '400px'
        style.maxHeight = '280px'

        if (style.top[0] === '-') {
            // negative top
            style.top = '0px'
        }

        const container = document.getElementById(parentContainerId)
        const parentRect = container.getBoundingClientRect()
        const childRect = element.getBoundingClientRect()

        if (childRect.right > parentRect.right) {
            const difference = childRect.right - parentRect.right
            style.left = `${childRect.left - difference}px`
        }
        if (childRect.left < 0) {
            style.left = `0px`
        }
        // TODO: What if child.left < parent. left?
    }

    function initQueryTab(
        /** @type {any} */ data,
        /** @type {any} */ headers,
        /** @type {number} */ pageCount,
        /** @type {number} */ rowCount,
        /** @type {any} */ defaultPageSizes,
        /** @type {any} */ schemaQueryResult,
        /** @type {any} */ editorSettings
    ) {
        console.log('initQueryTab()')
        const queryTab = tabManager.getTab(requestSourceQueryTab)
        queryTab?.addTable({
            schema: schemaQueryResult,
        })

        queryTab?.addEditor(editorSettings)

        queryTab?.addResultControls({
            search: 'remote',
        })
        queryTab?.addPagination({
            enabled: true,
            defaultPageSizes: defaultPageSizes,
            pageCount: pageCount,
            rowCount: rowCount,
            isQueryAble: isQueryAble,
        })
        queryTab?.addSortFunctionality()

        const columns = headers.map((c) => ({
            ...c,
            sorter: function (a, b, aRow, bRow, column, dir, sorterParams) {
                return 0
            },
            cellClick: onCellClick,
            headerTooltip: true,
        }))

        const footerHTML = queryTab?.pagination.getFooterHTML()
        queryTab?.tableWrapper?.build(data, columns, footerHTML)

        queryTab?.tableWrapper.addEventListener('tableBuilt', (e) => {
            console.log('queryTab tableBuilt')
            queryTab?.editor.initialize()
            queryTab?.editor.editorControls.initialize()
            queryTab?.resultControls.initialize()
            queryTab?.pagination?.initialize()
            queryTab?.sort.initialize()
        })
    }

    function initMetaDataTab(/** @type {any} */ data) {
        const columns = [
            // {title:"#", field:"index", width: 150},
            {
                title: 'Key',
                field: 'key',
                width: 200,
                headerTooltip: true,
            },
            {
                title: 'Value',
                field: 'value',
                width: 500,
                headerTooltip: true,
            },
        ]
        metadataTable = new Tabulator('#metadata', {
            placeholder: 'No Data Available', //display message to user on empty table
            data: data,
            columns: columns,
        })

        metadataTable.on('popupOpened', onPopupOpenedMetaDataTab)
    }

    function initSchemaTab(
        /** @type {any} */ data,
        /** @type {any} */ schemaQueryResult
    ) {
        const schemaTab = tabManager.getTab(requestSourceSchemaTab)
        schemaTab?.addTable({
            schema: schemaQueryResult,
        })
        schemaTab?.addResultControls({
            search: 'local',
        })

        const columns = [
            {
                title: '#',
                field: 'index',
                width: 50,
                headerTooltip: true,
            },
            {
                title: 'Column name',
                field: 'name',
                width: 150,
                cellClick: onCellClick,
                headerTooltip: true,
            },
            {
                title: 'Data type',
                field: 'type',
                width: 150,
                cellClick: onCellClick,
                headerTooltip: true,
            },
            {
                title: 'Nullable',
                field: 'nullable',
                width: 150,
                headerTooltip: true,
            },
            {
                title: 'Metadata',
                field: 'metadata',
                width: 150,
                headerTooltip: true,
            },
        ]

        schemaTab?.tableWrapper?.build(data, columns, undefined)

        schemaTab?.tableWrapper.addEventListener('tableBuilt', (e) => {
            schemaTab?.resultControls.initialize()
        })
    }

    function initDataTab(
        /** @type {any} */ data,
        /** @type {any} */ headers,
        /** @type {number} */ pageCount,
        /** @type {number} */ rowCount,
        /** @type {any} */ defaultPageSizes,
        /** @type {any} */ schemaQueryResult
    ) {
        // console.log('initDataTab()')
        const dataTab = tabManager.getTab(requestSourceDataTab)
        dataTab?.addTable({
            schema: schemaQueryResult,
        })
        dataTab?.addResultControls({
            search: 'remote',
        })
        dataTab?.addPagination({
            enabled: true,
            defaultPageSizes: defaultPageSizes,
            pageCount: pageCount,
            rowCount: rowCount,
            isQueryAble: isQueryAble,
        })
        dataTab?.addSortFunctionality()

        let columns = headers.map((c) => ({
            ...c,
            ...(isQueryAble && {
                sorter: function (a, b, aRow, bRow, column, dir, sorterParams) {
                    return 0
                },
            }),
            cellClick: onCellClick,
            headerTooltip: true,
        }))

        const footerHTML = dataTab?.pagination.getFooterHTML()

        dataTab?.tableWrapper?.build(data, columns, footerHTML)

        dataTab?.tableWrapper.addEventListener('tableBuilt', (e) => {
            console.log('dataTab tableBuilt')
            dataTab?.resultControls.initialize()
            dataTab?.pagination?.initialize()
            dataTab?.sort.initialize()
        })
    }

    function handleError(/** @type {string} */ source) {
        // console.log(`handleError(source:${source})`);
        const tab = tabManager.getTab(source)
        tab?.editor.editorControls.reset()
        tab?.tableWrapper.clearAlert()
    }

    function handleColorThemeChangeById(id, href) {
        const mainColorThemeLink = document.getElementById(id)
        if (mainColorThemeLink?.rel === 'stylesheet') {
            mainColorThemeLink.href = href
        }
    }

    function updateTable(
        /** @type {any} */ data,
        /** @type {any} */ headers,
        /** @type {number} */ rowCount,
        /** @type {string} */ requestSource,
        /** @type {string} */ requestType,
        /** @type {number} */ pageCount,
        /** @type {number} */ pageNumber,
        /** @type {any} */ schema
    ) {
        const tab = tabManager.getTab(requestSource)
        if (requestType === 'query') {
            // FIXME: DRY. Put this in a method.
            tab.pagination.rowCount = rowCount
            tab.pagination.pageCount = pageCount
            tab.pagination.pageNumber = pageNumber
            tab.tableWrapper.schema = schema

            tab?.tableWrapper.replaceData(data)

            const columns = headers.map((c) => ({
                ...c,
                sorter: function (a, b, aRow, bRow, column, dir, sorterParams) {
                    return 0
                },
                cellClick: onCellClick,
                headerTooltip: true,
            }))
            tab?.tableWrapper.setColumns(columns)
            tab?.editor?.editorControls.reset()
            tab?.sort.initialize()
            tab?.tableWrapper.clearAlert()
        } else if (requestType === 'paginator') {
            tab.pagination.rowCount = rowCount
            tab.pagination.pageCount = pageCount

            tab?.tableWrapper.replaceData(data)
            tab?.tableWrapper.clearAlert()
        } else if (requestType === 'search') {
            tab.pagination.rowCount = rowCount
            tab.pagination.pageCount = pageCount
            tab.pagination.pageNumber = pageNumber

            tab?.tableWrapper.replaceData(data)
            tab?.tableWrapper.clearAlert()
        }
    }

    function updateResultCount(/** @type {Number} */ rowCount) {
        // queryTable.pagination.updateResultCount(rowCount)
    }

    function updatePageCounterState(
        /** @type {Number} */ pageCount,
        /** @type {String} */ requestSource
    ) {
        // console.log(`updatePageCounterState(amountOfPages:${amountOfPages}, ${requestSource})`);

        const tab = tabManager.getTab(requestSource)
        if (requestSource === requestSourceDataTab) {
            tab.pagination.updatePageCounterState(pageCount)
            return
        }

        if (requestSource === requestSourceQueryTab) {
            tab.pagination.updatePageCounterState(pageCount)
            return
        }
    }

    function updateNavigationButtonsState(
        /** @type {Number} */ amountOfPages,
        /** @type {String} */ requestSource
    ) {
        // console.log(`updateNavigationButtonsState(${currentPage}, ${amountOfPages}, ${requestSource})`);

        const tab = tabManager.getTab(requestSource)
        if (requestSource === requestSourceDataTab) {
            tab.pagination.updateNavigationButtonsState(amountOfPages)
            return
        }

        if (requestSource === requestSourceQueryTab) {
            tab.pagination.updateNavigationButtonsState(amountOfPages)
            return
        }
    }

    // Handle messages from the extension
    window.addEventListener('message', async (e) => {
        // console.log(e.data);
        const { type, body } = e.data
        switch (type) {
            case 'init': {
                const tableData = body.tableData
                initialize(tableData)
                break
            }
            case 'update': {
                const tableData = body.tableData
                if (tableData) {
                    updateTable(
                        tableData.rawData,
                        tableData.headers,
                        tableData.rowCount,
                        tableData.requestSource,
                        tableData.requestType,
                        tableData.pageCount,
                        tableData.pageNumber,
                        tableData.schema
                    )

                    updatePageCounterState(
                        tableData.pageCount,
                        tableData.requestSource
                    )
                    updateNavigationButtonsState(
                        tableData.pageCount,
                        tableData.requestSource
                    )
                    updateResultCount(tableData.rowCount)
                }
                break
            }
            case 'colorThemeChange': {
                handleColorThemeChangeById(
                    'main-color-theme',
                    body.pathMainCssFile
                )
                handleColorThemeChangeById(
                    'tabs-color-theme',
                    body.pathTabsCssFile
                )

                // Set ace theme
                const tab = tabManager.getTab(requestSourceQueryTab)
                tab?.editor.setTheme(body.aceTheme)
                break
            }
            case 'exportComplete': {
                // TODO: Move to dropdown-menu.js
                const exportResultsButton = document.getElementById(
                    `export-${body.tabName}`
                )
                exportResultsButton?.removeAttribute('disabled')

                const exportResultsButtonText = document.getElementById(
                    `export-text-${body.tabName}`
                )
                exportResultsButtonText.innerText = 'Export results'
                break
            }
            case 'error': {
                handleError(body.source)
                break
            }
        }
    })

    // Signal to VS Code that the webview is initialized.
    vscode.postMessage({ type: 'ready' })
})()
