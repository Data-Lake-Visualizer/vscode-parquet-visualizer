// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.

(function () {
    const vscode = acquireVsCodeApi();

    let dataTable;
    let schemaTable;
    let metadataTable;
    let resultsTable;
    let schemaQueryResult;

    let aceEditor;

    let dataTableBuilt = false;
    let queryHasRun = false;
    let isQueryRunning = false;


    let currentPageDataTab = 1;
    let currentPageQueryTab = 1;
    let amountOfPagesDataTab = 0;
    let amountOfPagesQueryTab = 0;
    
    let rowCountDataTab = 1;
    let rowCountQueryTab = 0;

    let sortObjectDataTab;
    let sortObjectQueryTab;

    let defaultPageSizes = [];

    let numRecordsDropDownResultTableHasChanged = false;
    let numRecordsDropdownSelectedIndex = 0;

    const requestSourceDataTab = 'dataTab';
    const requestSourceQueryTab = 'queryTab';

    document.getElementById("data-tab").addEventListener("click", handleTabChange);
    document.getElementById("schema-tab").addEventListener("click", handleTabChange);
    document.getElementById("query-tab").addEventListener("click", handleTabChange);
    document.getElementById("metadata-tab").addEventListener("click", handleTabChange);


    function handleTabChange(/** @type {any} */ e) {
        var i, tabcontent, tablinks;

        // Get all elements with class="tabcontent" and hide them
        tabcontent = document.getElementsByClassName("tab");
        for (i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = "none";
        }

        // Get all elements with class="tablinks" and remove the class "active"
        tablinks = document.getElementsByClassName("tablinks");
        for (i = 0; i < tablinks.length; i++) {
            // tablinks[i].className = tablinks[i].className.replace(" active", "");
            tablinks[i].checked = false;
        }

        // Show the current tab, and add an "active" class to the button that opened the tab
        const id = e.currentTarget.id;
        if (id === 'data-tab') {
            document.getElementById('data-tab-panel').style.display = "block";
        } else if (id === 'schema-tab'){
            document.getElementById('schema-tab-panel').style.display = "block";
        } else if (id === 'query-tab')  {
            document.getElementById('query-tab-panel').style.display = "block";
        }
        else {
            document.getElementById('metadata-tab-panel').style.display = "block";
        }
        e.currentTarget.checked = true;
    }

    function onSort(query, /** @type {String} */ requestSource) {
        const resetSortButton = document.querySelector(`#reset-sort-${requestSource}`);
        resetSortButton?.removeAttribute('disabled');

        const selectedOption = getSelectedPageSize(requestSource);
        const queryString = getTextFromEditor(aceEditor);
        
        const sortObject = (query) ? {
            field: query.field,
            direction: query.dir
        } : undefined;

        let pageNumber;
        if (requestSource === requestSourceDataTab) {
            sortObjectDataTab = sortObject;
            pageNumber = currentPageDataTab;
            dataTable.alert("Loading...");
        } else {
            sortObjectQueryTab = sortObject;
            pageNumber = currentPageQueryTab;
            resultsTable.alert("Loading...");
        }

        vscode.postMessage({
            type: 'onSort',
            source: requestSource,
            query: {
                queryString: queryString,
                pageNumber: pageNumber,
                pageSize: selectedOption.innerText,
                sort: sortObject
            }
        });
    }

    function onCellClick(e, cell) {
        const val = cell.getValue();

        let popupValue = '';
        try{
            const obj = JSON.parse(val);
            popupValue = `<pre>${JSON.stringify(obj, undefined, 4)}</pre>`;
        } catch(e) {
            popupValue = val;
        }

        cell.popup(popupValue, "center");
    }

    function onMenuOpened(component) {
        const element = document.getElementsByClassName("tabulator-menu tabulator-popup-container")[0];
        let style = element.style;

        style.top = '30px';
        style.height = '200px';
        style.overflowX  = 'auto';
        style.overflowY  = 'auto';
    }

    function onPopupOpenedDataTab(component) {
        const parentContainerId = "data-tab-panel";
        onPopupOpened(parentContainerId);
    }

    function onPopupOpenedQueryResultTab(component) {
        const parentContainerId = "table-queryTab";
        onPopupOpened(parentContainerId);
    }

    function onPopupOpenedSchemaTab(component) {
        const parentContainerId = "schema";
        onPopupOpened(parentContainerId);
    }

    function onPopupOpenedMetaDataTab(component) {
        const parentContainerId = "metadata";
        onPopupOpened(parentContainerId);
    }

    function containsHTML(str) {
        const htmlTagRegex = /<\/?[a-z][\s\S]*>/i; // Matches opening or closing HTML tags
        return htmlTagRegex.test(str);
    }

    function escapeHtml(htmlString) {
        return htmlString
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function onPopupOpened(parentContainerId) {
        const element = document.getElementsByClassName("tabulator-popup tabulator-popup-container")[0];
        let innerHTML = element.innerHTML;
        let style = element.style;

        // Check if html contains JSON. Make it a little bit wider and horizontally scrollable
        if (innerHTML.includes('pre')) {
            style.width = '400px';
            style.overflowX  = 'auto';

            let tab = '';
            if (parentContainerId === "metadata") {
                tab = "metadataTab";
            } else if (parentContainerId === "schema") {
                tab = "schemaTab";
            } else if (parentContainerId === "table-queryTab") {
                tab = "queryTab";
            } else {
                tab = "dataTab";
            }
            
            vscode.postMessage({
                type: "onPopupOpened",
                tab: tab
            });

        } else {
            if (containsHTML(innerHTML)) {
                element.innerHTML = escapeHtml(innerHTML);
            }
        }

        style.minWidth = '400px';
        style.maxHeight = '280px';

        if (style.top[0] === '-') { // negative top
            style.top = '0px';
        }

        const container = document.getElementById(parentContainerId);
        const parentRect = container.getBoundingClientRect();
        const childRect = element.getBoundingClientRect();

        if (childRect.right > parentRect.right) {
            const difference = childRect.right - parentRect.right;
            style.left = `${childRect.left - difference}px`;
        } 
        if (childRect.left < 0){
            style.left = `0px`;
        }
        // TODO: What if child.left < parent. left?
    }

    function initializeSort(/** @type {String} */ requestSource) {
        let selectors; 
        if (requestSource === requestSourceQueryTab) {
            selectors = `#table-${requestSource} .tabulator-col-sorter.tabulator-col-sorter-element`;
        } else {
            selectors = `#table .tabulator-col-sorter.tabulator-col-sorter-element`;
        }
        
        const elements = document.querySelectorAll(selectors);
        elements.forEach(e => {
            e.addEventListener('click', (event) => {
                // Prevent other click listeners from firing
                event.stopPropagation();
                event.stopImmediatePropagation();

                const parentWithClass = event.target.closest('.tabulator-col.tabulator-sortable');
                const ariaSort = parentWithClass.getAttribute('aria-sort');
                const tabulatorField = parentWithClass.getAttribute('tabulator-field');

                const sortQuery = {
                    field: tabulatorField,
                    dir: ariaSort === 'ascending' ? 'asc' : 'desc'
                };
                onSort(sortQuery, requestSource);
            });
        });
    }

    function resetQueryControls(){
        // console.log("resetQueryControl()");

        const runQueryButton = document.getElementById("run-query-btn");
        runQueryButton?.removeAttribute('disabled');
        runQueryButton.innerText = 'Run';
        resultsTable.clearAlert();
    }

    function resetQueryResultControls(rowCount){
        // console.log("resetQueryResultControls()");

        if (!queryHasRun) {
            return;
        }

        const resultsCountElement = document.getElementById("query-count");
        resultsCountElement.innerHTML = `<strong>Results</strong> (${rowCount})&nbsp;`;

        const pageCountElement = document.getElementById("page-count");
        pageCountElement.innerHTML = `<span>&nbsp;|&nbsp;</span>
            <span>
                <span>Showing</span>
                <span id="page-current-${requestSourceQueryTab}"> ${currentPageQueryTab} </span>
                <span>of</span>
                <span id="page-count-${requestSourceQueryTab}"> ${amountOfPagesQueryTab} </span>
                <span>pages</span>
            </span>
        `;
        
        const exportResultsButton = document.getElementById(`export-query-results`);
        exportResultsButton?.removeAttribute('disabled');

        const copyButton = document.getElementById(`copy-query-results`);
        copyButton?.removeAttribute('disabled');

        const searchContainer = document.getElementById(`input-filter-values`);
        searchContainer?.removeAttribute('disabled');
    }

    function initResultTable(/** @type {any} */ data, /** @type {any} */ headers) {
        let columns = headers.map(c => (
            {
                ...c, 
                sorter: function(a, b, aRow, bRow, column, dir, sorterParams){
                    return 0;
                },
                cellClick: onCellClick,
            }
        ));

        const numRecordsDropdown = /** @type {HTMLSelectElement} */ (document.querySelector(`#dropdown-page-size-${requestSourceQueryTab}`));
        if (numRecordsDropdown) {
            numRecordsDropdownSelectedIndex = numRecordsDropdown.selectedIndex;
        }

        const options = createOptionHTMLElementsString(defaultPageSizes);

        resultsTable = new Tabulator(`#table-${requestSourceQueryTab}`, {
            columnDefaults:{
                width:150, //set the width on all columns to 200px
            },
            placeholder:"No results. Run a query to view results", //display message to user on empty table
            data: data,
            columns: columns,
            headerSortClickElement: "icon",
            clipboard: "copy", 
            clipboardCopyStyled:false,
            clipboardCopyFormatter: function(type, output) {
                if (type === "plain") {
                    return output;
                } else if (type === "html") {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(output, 'text/html');

                    const table = doc.querySelector('table');
                    table.removeAttribute('class');

                    table.querySelectorAll('tr').forEach((tr) => {
                        tr.removeAttribute('class');
                    });

                    table.querySelectorAll('td').forEach((td) => {
                        const type = schemaQueryResult[td.cellIndex].column_type;
                        // Check for numbers with leading zeros
                        if (type === "VARCHAR") {
                            td.classList.add('text');
                        }
                        // Check for integer
                        else if (type === "INTEGER" || type === "BIGINT") {
                            td.classList.add('integer');
                        }
                        // Check for float
                        else if (type === "DOUBLE" || type === "FLOAT") {
                            td.classList.add('float');
                        }
                        else if (type.endsWith("[]")) {
                            td.classList.add('text');
                        }
                        else if (type.includes("STRUCT")) {
                            td.classList.add('text');
                        }
                        else if (type.includes("MAP")) {
                            td.classList.add('text');
                        }
                        else if (type === "TIMESTAMP") {
                            td.classList.add('time');
                        }
                        else if (type === "DATE") {
                            td.classList.add('date');
                        }
                        // Fallback to text
                        else {
                            td.classList.add('text');
                        }
                    });

                    const completeDoc = document.implementation.createHTMLDocument();
                    const style = completeDoc.createElement('style');
                    style.textContent = `
                        th { font-weight: normal; }
                        td, th { white-space: nowrap; }
                        td.text { mso-number-format:"\\@";} 
                        td.float { mso-number-format: "#,##0.00";}
                        td.integer { mso-number-format: "#,##0"; }
                        td.time { mso-number-format: "yyyy\-mm\-dd hh\:mm\:ss; }
                        td.date { mso-number-format: "yyyy\-mm\-dd; }
                    `;

                    completeDoc.head.appendChild(style);
                    completeDoc.body.appendChild(table);

                    const serializer = new XMLSerializer();
                    const outputHtml = serializer.serializeToString(completeDoc);
                    return outputHtml;
                }
                return output;
            },
            clipboardCopyConfig:{
                columnHeaders:true,
                columnGroups:false,
                rowHeaders:false,
                rowGroups:false,
                columnCalcs:false,
                dataTree:false,
                formatCells:false,
            },
            footerElement: `<span class="tabulator-page-counter" id="query-count"></span>
                    <span class="tabulator-page-counter" id="page-count"></span>
                    <span class="tabulator-paginator">
                        <button class="tabulator-page" disabled id="reset-sort-${requestSourceQueryTab}" type="button" role="button" aria-label="Reset Sort" title="Reset Sort" style="margin-right: 10px;">Reset Sort</button>
                        <label>Page Size</label>
                        <select class="tabulator-page-size" id="dropdown-page-size-${requestSourceQueryTab}" aria-label="Page Size" title="Page Size">
                            ${options}
                        </select>
                        <button class="tabulator-page" disabled id="btn-first-${requestSourceQueryTab}" type="button" role="button" aria-label="First Page" title="First Page" data-page="first">First</button>
                        <button class="tabulator-page" disabled id="btn-prev-${requestSourceQueryTab}" type="button" role="button" aria-label="Prev Page" title="Prev Page" data-page="prev">Prev</button>
                    </span>
                    <button class="tabulator-page" disabled id="btn-next-${requestSourceQueryTab}" type="button" role="button" aria-label="Next Page" title="Next Page" data-page="next">Next</button>
                    <button class="tabulator-page" disabled id="btn-last-${requestSourceQueryTab}" type="button" role="button" aria-label="Last Page" title="Last Page" data-page="last">Last</button>
            `,
        });

        resultsTable.on("popupOpened", onPopupOpenedQueryResultTab);

        resultsTable.on("tableBuilt", function(data){
            initializeSort(requestSourceQueryTab);
            resetQueryControls();
            resetQueryResultControls(rowCountQueryTab);
            initializeFooter(rowCountQueryTab, requestSourceQueryTab);
            updatePageCounterState(currentPageQueryTab, amountOfPagesQueryTab, requestSourceQueryTab);
            updateNavigationButtonsState(currentPageQueryTab, amountOfPagesQueryTab, requestSourceQueryTab);

            if (numRecordsDropDownResultTableHasChanged) {
                const numRecordsDropdown = /** @type {HTMLSelectElement} */ (document.querySelector(`#dropdown-page-size-${requestSourceQueryTab}`));
                numRecordsDropdown.selectedIndex = numRecordsDropdownSelectedIndex;
            }
        });
    }

    function getTextFromEditor(editor) {
        var selectedText = editor.getSelectedText();
        if (selectedText) {
            return selectedText;
        } else {
            return editor.getValue();
        }
    }

    function getSelectedPageSize(requestSource){
        const numRecordsDropdown = /** @type {HTMLSelectElement} */ (document.querySelector(`#dropdown-page-size-${requestSource}`));
        const selectedIndex = numRecordsDropdown.selectedIndex;
        return numRecordsDropdown.options[selectedIndex];
    }

    function runQuery(editor) {
        if (isQueryRunning) {
            return;
        }

        resultsTable.alert("Loading...");

        const runQueryButton = document.getElementById("run-query-btn");
        runQueryButton.setAttribute('disabled', '');
        runQueryButton.innerText = 'Running';

        const selectedOption = getSelectedPageSize(requestSourceQueryTab);
        const query = getTextFromEditor(editor);

        vscode.postMessage({
            type: 'startQuery',
            query: {
                queryString: query,
                pageSize: selectedOption.innerText,
            }
        });
        isQueryRunning = true;
    }

    function initCodeEditor(
        defaultQuery, shortCutMapping, aceTheme, aceEditorCompletions
    ) {
        aceEditor = ace.edit("editor");

        aceEditor.setTheme(aceTheme);
        aceEditor.session.setMode("ace/mode/sql");        
        aceEditor.setValue(defaultQuery);
        
        aceEditor.setOptions({
            enableBasicAutocompletion: true,
            enableSnippets: true,
            enableLiveAutocompletion: true,
        });

        const completer = {
            getCompletions: function(editor, session, pos, prefix, callback) {
                callback(null, aceEditorCompletions);
            }
        };

        var langTools = ace.require("ace/ext/language_tools");
        langTools.addCompleter(completer);

        aceEditor.commands.addCommand({
            name: 'runQuery',
            bindKey: shortCutMapping,
            exec: function(aceEditor) {
                runQuery(aceEditor);
            }
        });


        const runQueryButton = document.getElementById("run-query-btn");
        runQueryButton?.addEventListener('click', (e) => {
            runQuery(aceEditor);
        });

        const clearQueryTextButton = document.getElementById("clear-query-btn");
        clearQueryTextButton?.addEventListener('click', (e) => {
            aceEditor.setValue("");
        });

    }

    function initMetaData (/** @type {any} */  data) {
        const columns = [
            // {title:"#", field:"index", width: 150},
            {title:"Key", field:"key", width: 200},
            {title:"Value", field:"value", width: 500},
        ];
        metadataTable = new Tabulator("#metadata", {
            placeholder:"No Data Available", //display message to user on empty table
            data: data,
            columns: columns,
        });

        metadataTable.on("popupOpened", onPopupOpenedMetaDataTab);
    }

    function initSchema (/** @type {any} */  data) {
        const columns = [
            {title:"#", field:"index", width: 50},
            {title:"Column name", field:"name", width: 150},
            {
                title:"Data type", 
                field:"type", 
                width: 150,
                cellClick:onCellClick
            },
            {title:"Nullable", field:"nullable", width: 150},
            {title:"Metadata", field:"metadata", width: 150},
        ];
        schemaTable = new Tabulator("#schema", {
            columnDefaults:{
                width:150, //set the width on all columns to 200px
            },
            placeholder:"No Data Available", //display message to user on empty table
            data: data,
            columns: columns,
        });

        schemaTable.on("popupOpened", onPopupOpenedSchemaTab);
    }

    var headerMenu = function(){
        var menu = [];
        var columns = this.getColumns();
        
        function createIcon(isVisible){
            let icon = document.createElement("i");
            icon.classList.add("fas");
            icon.classList.add(isVisible ? "fa-check-square" : "fa-square");
            return icon;
        }

        function createLabel(columnTitle, icon){
            //build label
            let label = document.createElement("span");
            let title = document.createElement("span");
    
            title.textContent = " " + columnTitle;
    
            label.appendChild(icon);
            label.appendChild(title);
            return label;
        }

        for(let column of columns){
            //create checkbox element using font awesome icons
            const columnTitle = column.getDefinition().title;
            let icon = createIcon(column.isVisible());
            let label = createLabel(
                columnTitle,
                icon
            );

            //create menu item
            menu.push({
                label:label,
                action:function(e){
                    //prevent menu closing
                    e.stopPropagation();
    
                    //toggle current column visibility
                    column.toggle();
    
                    //change menu item icon
                    if(column.isVisible()){
                        icon.classList.remove("fa-square");
                        icon.classList.add("fa-check-square");
                    }else{
                        icon.classList.remove("fa-check-square");
                        icon.classList.add("fa-square");
                    }
                }
            });
        }
        return menu;
    };

    function createOptionHTMLElementsString(/** @type {number[]} */ defaultPageSizes) {
        let html = '';
        defaultPageSizes.forEach((pageSize, idx) => {
            if (idx === 0) {
                html += `<option value="${pageSize}" selected="selected">${pageSize}</option>\n`;
            } else {
                html += `<option value="${pageSize}">${pageSize}</option>\n`;
            }
        });
        return html;
    }

    function initDataTable(/** @type {any} */ data) {
        let columns = data.headers.map(c => (
            {
                ...c, 
                sorter: function(a, b, aRow, bRow, column, dir, sorterParams){
                    return 0;
                },
                cellClick: onCellClick,
                // headerMenu: headerMenu
            }
        ));

        const options = createOptionHTMLElementsString(defaultPageSizes);
        dataTable = new Tabulator("#table", {
            columnDefaults:{
                width:150,
            },
            placeholder:"No Data Available",
            headerSortClickElement: "icon",
            data: data.rawData,
            columns: columns,
            pagination: false,
            footerElement:`<span class="tabulator-page-counter">
                        <span>
                            <span>Showing</span>
                            <span id="page-current-${requestSourceDataTab}"> 1 </span>
                            <span>of</span>
                            <span id="page-count-${requestSourceDataTab}"> ${data.pageCount} </span>
                            <span>pages</span>
                        </span>
                    </span>
                    <span class="tabulator-paginator">
                        <button class="tabulator-page" disabled id="reset-sort-${requestSourceDataTab}" type="button" role="button" aria-label="Reset Sort" title="Reset Sort" style="margin-right: 10px;">Reset Sort</button>

                        <label>Page Size</label>
                        <select class="tabulator-page-size" id="dropdown-page-size-${requestSourceDataTab}" aria-label="Page Size" title="Page Size">
                            ${options}
                        </select>
                        <button class="tabulator-page" disabled id="btn-first-${requestSourceDataTab}" type="button" role="button" aria-label="First Page" title="First Page" data-page="first">First</button>
                        <button class="tabulator-page" disabled id="btn-prev-${requestSourceDataTab}" type="button" role="button" aria-label="Prev Page" title="Prev Page" data-page="prev">Prev</button>
                        <button class="tabulator-page" id="btn-next-${requestSourceDataTab}" type="button" role="button" aria-label="Next Page" title="Next Page" data-page="next">Next</button>
                        <button class="tabulator-page" id="btn-last-${requestSourceDataTab}" type="button" role="button" aria-label="Last Page" title="Last Page" data-page="last">Last</button>
                    </span>
            `,
        });

        dataTable.on("tableBuilt", () => {
            dataTableBuilt = true;
            initializeSort(requestSourceDataTab);
            initializeFooter(rowCountDataTab, requestSourceDataTab);
            updatePageCounterState(currentPageDataTab, amountOfPagesDataTab, requestSourceDataTab);
            updateNavigationButtonsState(currentPageDataTab, amountOfPagesDataTab, requestSourceDataTab);
        });

        dataTable.on("popupOpened", onPopupOpenedDataTab);
        dataTable.on("menuOpened", onMenuOpened);
    }

    function handleError (){
        // console.log("handleError()");
        // query error
        resetQueryControls();
    }

    function handleColorThemeChangeById(id, href){
        var mainColorThemeLink = document.getElementById(id);
        if (mainColorThemeLink.rel === "stylesheet"){
            mainColorThemeLink.href = href;
        }
    }

    function updateTable(
        /** @type {any} */ data, 
        /** @type {any} */ headers, 
        /** @type {number} */ rowCount, 
        /** @type {string} */ requestSource,
        /** @type {string} */ requestType,
        /** @type {number} */ currentPage,
        /** @type {number} */ pageCount,
        /** @type {any} */ schema,
        /** @type {any} */ sort,
    ) {
        // console.log("updateTable");
        if (requestSource === requestSourceDataTab){
            if (dataTableBuilt){
                dataTable.replaceData(data);
                dataTable.clearAlert();
            }
        } else if (requestSource === requestSourceQueryTab) {
            if (requestType === 'query'){
                queryHasRun = true;

                schemaQueryResult = schema; 
                rowCountQueryTab = rowCount;
                currentPageQueryTab = currentPage;
                amountOfPagesQueryTab = pageCount;
                sortObjectQueryTab = undefined;

                if (sort) {
                    resultsTable.replaceData(data);
                    resultsTable.clearAlert();
                } else {
                    initResultTable(data, headers);
                }

                isQueryRunning = false;

            } else if (requestType === 'paginator') {
                resultsTable.replaceData(data);
                resultsTable.clearAlert();
            }
        }
    }

    function doesFooterExist(){
        const footer = document.querySelector(".tabulator-footer");
        if (!footer) {
            console.error("footer doesn't exist yet.");
            return false;
        }
        return true;
    }

    function updatePageCounterState(
        /** @type {Number} */ currentPage ,  
        /** @type {Number} */ amountOfPages,
        /** @type {String} */ requestSource,

    ){
        // console.log(`updatePageCounterState(${currentPage}, ${amountOfPages})`);

        if (!doesFooterExist()){
            return;
        }

        const currentPageSpan = /** @type {HTMLElement} */ (document.querySelector(`#page-current-${requestSource}`));
        const countPageSpan = /** @type {HTMLElement} */ (document.querySelector(`#page-count-${requestSource}`));

        if (requestSource === requestSourceQueryTab) {
            if (!currentPageSpan && !countPageSpan) {
                
            } else {
                currentPageSpan.innerText = currentPage.toString();
                countPageSpan.innerText = amountOfPages.toString();
            }
        } else {
            currentPageSpan.innerText = currentPage.toString();
            countPageSpan.innerText = amountOfPages.toString();
        }
    }

    function updateNavigationButtonsState(
        /** @type {Number} */ currentPage, 
        /** @type {Number} */ amountOfPages,
        /** @type {String} */ requestSource,
    ){
        // console.log(`updateNavigationButtonsState(currentPage: ${currentPage}, amountOfPages: ${amountOfPages})`);

        if (!doesFooterExist()){
            return;
        }

        const nextButton = /** @type {HTMLElement} */ (document.querySelector(`#btn-next-${requestSource}`));
        const prevButton = /** @type {HTMLElement} */ (document.querySelector(`#btn-prev-${requestSource}`));
        const firstButton = /** @type {HTMLElement} */ (document.querySelector(`#btn-first-${requestSource}`));
        const lastButton = /** @type {HTMLElement} */ (document.querySelector(`#btn-last-${requestSource}`));

        if (amountOfPages === 1) {
            nextButton.setAttribute('disabled', '');
            prevButton.setAttribute('disabled', '');
            firstButton.setAttribute('disabled', '');
            lastButton.setAttribute('disabled', '');
        }

        if (currentPage === amountOfPages){
            nextButton.setAttribute('disabled', '');
            lastButton.setAttribute('disabled', '');
        }

        if (currentPage > 1){
            prevButton.removeAttribute('disabled');
            firstButton.removeAttribute('disabled');
        }

        if (currentPage < amountOfPages ) {
            nextButton.removeAttribute('disabled');
            lastButton.removeAttribute('disabled');
        }

        if (currentPage === 1){
            prevButton.setAttribute('disabled', '');
            firstButton.setAttribute('disabled', '');
        }
    }

    function initializeQueryResultControls() {
        // console.log("initializeQueryResultControls()");
        const exportResultsButton = /** @type {HTMLElement} */ (document.querySelector(`#export-query-results`));
        // Toggle dropdown menu visibility
        exportResultsButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent the event from bubbling up
            let dropdownMenu = document.getElementById('dropdown-menu');

            if (dropdownMenu.style.display === 'none' || dropdownMenu.style.display === '') {
                dropdownMenu.style.display = 'block';
            } else {
                dropdownMenu.style.display = 'none';
            }
        });

        document.getElementById('dropdown-menu').addEventListener('click', function(event) {
            event.stopPropagation();
            if (event.target.tagName === 'SPAN') {
                const selectedOption = event.target.getAttribute('data-value');

                // 
                const exportQueryResultsButton = document.getElementById("export-query-results");
                exportQueryResultsButton.setAttribute('disabled', '');

                const exportQueryResultsButtonText = document.getElementById("export-query-results-text");
                exportQueryResultsButtonText.innerText = 'Exporting...';
                vscode.postMessage({
                    type: 'exportQueryResults',
                    exportType: selectedOption
                });

                // Perform any additional actions here, e.g., close dropdown
                // Hide the menu if it's currently visible
                let dropdownMenu = document.getElementById('dropdown-menu');
                if (dropdownMenu.style.display === 'block') {
                    dropdownMenu.style.display = 'none';
                }
            }
        });

        // Close dropdown when clicking outside
        window.addEventListener('click', function() {
            let dropdownMenu = document.getElementById('dropdown-menu');
            
            // Hide the menu if it's currently visible
            if (dropdownMenu.style.display === 'block') {
                dropdownMenu.style.display = 'none';
            }
        });

        const clearIconButton = /** @type {HTMLElement} */ (document.querySelector(`#clear-icon`));
        clearIconButton.addEventListener("click", function () {
            var searchInput = document.getElementById('input-filter-values');
            searchInput.value = ''; // Clear the input field
            this.style.display = 'none'; // Hide the clear icon

            resultsTable.clearFilter(true);
        });

        const filterValueInput = /** @type {HTMLElement} */ (document.querySelector(`#input-filter-values`));
        filterValueInput.addEventListener("input", function () {

            // Check whether we should show the clear button.
            var clearIcon = document.getElementById('clear-icon');
            if (filterValueInput.value.length > 0) {
                clearIcon.style.display = 'flex';
            } else {
                clearIcon.style.display = 'none';
            }
            
            const searchValue = filterValueInput.value.trim();

            const columnLayout = resultsTable.getColumnLayout();
            const filterArray = columnLayout.map((c) => {
                return {
                    field: c.field,
                    type: 'like',
                    value: searchValue
                };
            });
            
            resultsTable.setFilter([filterArray]);
        });

        const copyResultsButton = /** @type {HTMLElement} */ (document.querySelector(`#copy-query-results`));
        copyResultsButton.addEventListener('click', () => {
            resultsTable.copyToClipboard("table");
            vscode.postMessage({
                type: 'copyQueryResults',
            });
        });
    }

    function initializeFooter(/** @type {Number} */ rowCount, /** @type {String} */ requestSource) {
        // console.log(`initializeFooter(rowCount:${rowCount}, requestSource:${requestSource})`);

        const resetSortButton = /** @type {HTMLElement} */ (document.querySelector(`#reset-sort-${requestSource}`));
        resetSortButton.addEventListener('click', () => {
            if (requestSource === requestSourceDataTab) {
                dataTable.clearSort();
            }
            else {
                resultsTable.clearSort();
            }

            const sortQuery = undefined;

            onSort(sortQuery, requestSource);
        });

        const nextButton = /** @type {HTMLElement} */ (document.querySelector(`#btn-next-${requestSource}`));
        const prevButton = /** @type {HTMLElement} */ (document.querySelector(`#btn-prev-${requestSource}`));
        const firstButton = /** @type {HTMLElement} */ (document.querySelector(`#btn-first-${requestSource}`));
        const lastButton = /** @type {HTMLElement} */ (document.querySelector(`#btn-last-${requestSource}`));

        nextButton.addEventListener('click', () => {
            const selectedIndex = numRecordsDropdown.selectedIndex;
            const selectedOption = numRecordsDropdown.options[selectedIndex];

            let sort;
            let pageNumber;
            if (requestSource === requestSourceDataTab) {
                dataTable.alert("Loading...");
                sort = sortObjectDataTab;
                currentPageDataTab += 1;
                pageNumber = currentPageDataTab;
            } else {
                resultsTable.alert("Loading...");
                sort = sortObjectQueryTab;
                currentPageQueryTab += 1;
                pageNumber = currentPageQueryTab;
            }
            vscode.postMessage({
                type: 'nextPage',
                pageSize: selectedOption.innerText,
                pageNumber: pageNumber,
                sort: sort,
                source: requestSource
            });
        });
    
        prevButton.addEventListener('click', () => {
            const selectedIndex = numRecordsDropdown.selectedIndex;
            const selectedOption = numRecordsDropdown.options[selectedIndex];

            let sort;
            let pageNumber;
            if (requestSource === requestSourceDataTab) {
                dataTable.alert("Loading...");
                sort = sortObjectDataTab;
                currentPageDataTab -= 1;
                pageNumber = currentPageDataTab;
            } else {
                resultsTable.alert("Loading...");
                sort = sortObjectQueryTab;
                currentPageQueryTab -= 1;
                pageNumber = currentPageQueryTab;
            }
            vscode.postMessage({
                type: 'prevPage',
                pageSize: selectedOption.innerText,
                pageNumber: pageNumber,
                sort: sort,
                source: requestSource
            });
        });
    
        firstButton.addEventListener('click', () => {
            const selectedIndex = numRecordsDropdown.selectedIndex;
            const selectedOption = numRecordsDropdown.options[selectedIndex];

            let sort;
            const pageNumber = 1;
            if (requestSource === requestSourceDataTab) {
                dataTable.alert("Loading...");
                sort = sortObjectDataTab;
                currentPageDataTab = 1;

            } else {
                resultsTable.alert("Loading...");
                sort = sortObjectQueryTab;
                currentPageQueryTab = 1;
            }
            vscode.postMessage({
                type: 'firstPage',
                pageSize: selectedOption.innerText,
                pageNumber: pageNumber,
                sort: sort,
                source: requestSource
            });
        });
    
        lastButton.addEventListener('click', () => {
            const selectedIndex = numRecordsDropdown.selectedIndex;
            const selectedOption = numRecordsDropdown.options[selectedIndex];

            let sort;
            let pageNumber;
            if (requestSource === requestSourceDataTab) {
                dataTable.alert("Loading...");
                sort = sortObjectDataTab;
                currentPageDataTab = amountOfPagesDataTab;
                pageNumber = amountOfPagesDataTab;
            } else {
                resultsTable.alert("Loading...");
                sort = sortObjectQueryTab;
                currentPageQueryTab = amountOfPagesQueryTab;
                pageNumber = amountOfPagesQueryTab;
            }
            vscode.postMessage({
                type: 'lastPage',
                pageSize: selectedOption.innerText,
                pageNumber: pageNumber,
                sort: sort,
                source: requestSource
            });
        });
    
        const numRecordsDropdown = /** @type {HTMLSelectElement} */ (document.querySelector(`#dropdown-page-size-${requestSource}`));
        numRecordsDropdown.value = `${defaultPageSizes[0]}`;

        if (rowCount <= 10 ) {
            numRecordsDropdown.setAttribute('disabled', '');
        } 
        else {
            numRecordsDropdown.addEventListener('change', (e) => {
                const selectedIndex = numRecordsDropdown.selectedIndex;
                const selectedOption = numRecordsDropdown.options[selectedIndex];

                let sort;
                const pageNumber = 1;
                if (requestSource === requestSourceDataTab) {
                    dataTable.alert("Loading...");
                    sort = sortObjectDataTab;
                    if (selectedOption.innerText.toLowerCase() === 'all') {
                        currentPageDataTab = 1;
                    }

                } else {
                    numRecordsDropDownResultTableHasChanged = true;
                    resultsTable.alert("Loading...");
                    sort = sortObjectQueryTab;
                    if (selectedOption.innerText.toLowerCase() === 'all') {
                        currentPageQueryTab = 1;
                    }
                }
                vscode.postMessage({
                    type: 'changePageSize',
                    data: {
                        newPageSize: selectedOption.innerText,
                        pageNumber: pageNumber,
                        sort: sort,
                        source: requestSource
                    }
                });
            });
        }
    }
    

    // Handle messages from the extension
    window.addEventListener('message', async e => {
        // console.log(e.data);
        const { type, body } = e.data;
        switch (type) {
            case 'init':{
                const tableData = body.tableData;
                if (tableData) {
                    rowCountDataTab = tableData.rowCount;
                    defaultPageSizes = tableData.settings.defaultPageSizes;
                    initDataTable(tableData);
                    initSchema(tableData.schema);
                    initMetaData(tableData.metaData);
                    initCodeEditor(
                        tableData.settings.defaultQuery,
                        tableData.settings.shortCutMapping,
                        tableData.aceTheme,
                        tableData.aceEditorCompletions
                    );
                    initializeQueryResultControls();
                    initResultTable([], []);

                    // currentPageDataTab = tableData.currentPage;
                    amountOfPagesDataTab = tableData.pageCount;
                }
                break;
            }
            case 'update': {
                const tableData = body.tableData;
                if (tableData) {
                    updateTable(
                        tableData.rawData, 
                        tableData.headers, 
                        tableData.rowCount, 
                        tableData.requestSource,
                        tableData.requestType,
                        tableData.currentPage,
                        tableData.pageCount,
                        tableData.schema,
                        tableData.sort
                    );
                    
                    updatePageCounterState(
                        tableData.currentPage, 
                        tableData.pageCount,
                        tableData.requestSource
                    );
                    updateNavigationButtonsState(
                        tableData.currentPage, 
                        tableData.pageCount,
                        tableData.requestSource
                    );
                }
                break;
            }
            case 'colorThemeChange': {
                handleColorThemeChangeById("main-color-theme", body.pathMainCssFile);
                handleColorThemeChangeById("tabs-color-theme", body.pathTabsCssFile);

                // Set ace theme
                aceEditor.setTheme(body.aceTheme);

                break;
            }
            case 'exportComplete' : {
                const exportQueryResultsButton = document.getElementById("export-query-results");
                exportQueryResultsButton?.removeAttribute('disabled');

                const exportQueryResultsButtonText = document.getElementById("export-query-results-text");
                exportQueryResultsButtonText.innerText = 'Export results';
                break;
            }
            case 'error': {
                handleError();
                break;
            }
        }
    });

    // Signal to VS Code that the webview is initialized.
    vscode.postMessage({ type: 'ready' });
}());
