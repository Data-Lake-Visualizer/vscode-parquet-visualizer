const NAME_QUERY_TAB = 'queryTab'

class TableWrapper extends EventTarget {
    constructor(
        /** @type {Tab} */ tab,
        /** @type {any} */ parameters,
    ) {
        super();
        this.tab = tab

        this.schema = parameters.schema

        this.table = null
        // Bind the method to the instance
        this.onPopupOpened = this.onPopupOpened.bind(this);
        this.copyPageHandler = this.copyPageHandler.bind(this);

        this.events = {};

    }


    build(
        /** @type {Array<any>}*/ data = [],
        /** @type {Array<any>} */ columns,
        /** @type {string | undefined} */ footerHTML,

    ){        
        this.table = new Tabulator(this.tab.selector, {
            placeholder: "No Data Available",
            data: data,
            columns: columns,
            headerSortClickElement: 'icon',
            columnDefaults: {
                width: 150,
            },
            clipboard: 'copy',
            clipboardCopyStyled: false,
            clipboardCopyFormatter: this.copyPageHandler,
            clipboardCopyConfig: {
                columnHeaders: true,
                columnGroups: false,
                rowHeaders: false,
                rowGroups: false,
                columnCalcs: false,
                dataTree: false,
                formatCells: false,
            },
            footerElement: footerHTML,
        })

        this.table.on('popupOpened', this.onPopupOpened)

        this.table.on('tableBuilt',  (data) => {
            this.dispatchEvent(new CustomEvent('tableBuilt', { detail: data }));
        })
    }

    copyPageHandler(/** @type {any}*/ type, /** @type {any}*/ output) {
        if (type === 'plain') {
            return output
        } else if (type === 'html') {
            const parser = new DOMParser()
            const doc = parser.parseFromString(output, 'text/html')

            const HTMLTable = doc.querySelector('table')
            HTMLTable.removeAttribute('class')

            HTMLTable.querySelectorAll('tr').forEach((tr) => {
                tr.removeAttribute('class')
            })
            
            HTMLTable.querySelectorAll('td').forEach((td) => {
                const type = this.schema[td.cellIndex].column_type
                // Check for numbers with leading zeros
                if (type === 'VARCHAR') {
                    td.classList.add('text')
                }
                // Check for integer
                else if (type === 'INTEGER' || type === 'BIGINT') {
                    td.classList.add('integer')
                }
                // Check for float
                else if (type === 'DOUBLE' || type === 'FLOAT') {
                    td.classList.add('float')
                } else if (type.endsWith('[]')) {
                    td.classList.add('text')
                } else if (type.includes('STRUCT')) {
                    td.classList.add('text')
                } else if (type.includes('MAP')) {
                    td.classList.add('text')
                } else if (type === 'TIMESTAMP') {
                    td.classList.add('time')
                } else if (type === 'DATE') {
                    td.classList.add('date')
                }
                // Fallback to text
                else {
                    td.classList.add('text')
                }
            })

            const completeDoc =
                document.implementation.createHTMLDocument()
            const style = completeDoc.createElement('style')
            style.textContent = `
                th { font-weight: normal; }
                td, th { white-space: nowrap; }
                td.text { mso-number-format:"\\@";} 
                td.float { mso-number-format: "#,##0.00";}
                td.integer { mso-number-format: "#,##0"; }
                td.time { mso-number-format: "yyyy\-mm\-dd hh\:mm\:ss; }
                td.date { mso-number-format: "yyyy\-mm\-dd; }
            `

            completeDoc.head.appendChild(style)
            completeDoc.body.appendChild(HTMLTable)

            const serializer = new XMLSerializer()
            const outputHtml = serializer.serializeToString(completeDoc)
            return outputHtml
        }
        return output
    }


    replaceData (/** @type {any}*/ data) {
        this.table.replaceData(data)
    }

    setAlert() {
        this.table.alert("Loading...")
    }

    clearAlert() {
        this.table.clearAlert()
    }

    onPopupOpened(component) {
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
        } else {

            function containsHTML(/** @type {string}*/  str) {
                const htmlTagRegex = /<\/?[a-z][\s\S]*>/i // Matches opening or closing HTML tags
                return htmlTagRegex.test(str)
            }

            innerHTML = cellValue
            if (containsHTML(innerHTML)) {

                function escapeHtml(/** @type {string}*/ htmlString) {
                    return htmlString
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#039;')
                }
                element.innerHTML = escapeHtml(innerHTML)
            }
        }

        style.minWidth = '400px'
        style.maxHeight = '280px'

        if (style.top[0] === '-') {
            // negative top
            style.top = '0px'
        }

        const container = document.getElementById(`table-${this.tab.name}`)
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

        this.tab.vscode.postMessage({
            type: 'onPopupOpened',
            tab: this.tab.name,
        })
    }

    onCellClick(e, cell) {
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
}
