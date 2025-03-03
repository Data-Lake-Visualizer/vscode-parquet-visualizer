class TabManager{
    constructor() {
        /** @type {Map<string, Tab>} */  this.tabs = new Map();

        document
            .getElementById('query-tab')
            .addEventListener('click', this.handleTabChange)
        document
            .getElementById('data-tab')
            .addEventListener('click', this.handleTabChange)
        document
            .getElementById('schema-tab')
            .addEventListener('click', this.handleTabChange)
        document
            .getElementById('metadata-tab')
            .addEventListener('click', this.handleTabChange)
    }

    createTab(
        /** @type {string} */ selector,
        /** @type {string} */ tabName,
        /** @type {any} */ vscode,
    ) {
        if (!this.tabs.has(tabName)) {
            const tab = new Tab(
                selector,
                tabName,
                vscode
            );
            this.tabs.set(tabName, tab)
        }
        
    }

    getTab(/** @type {string} */ name) {
        return this.tabs.get(name)
    }

    handleTabChange(/** @type {any} */ e) {
        var i, tabcontent, tablinks

        // Get all elements with class="tabcontent" and hide them
        tabcontent = document.getElementsByClassName('tab')
        for (i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = 'none'
        }

        // Get all elements with class="tablinks" and remove the class "active"
        tablinks = document.getElementsByClassName('tablinks')
        for (i = 0; i < tablinks.length; i++) {
            // tablinks[i].className = tablinks[i].className.replace(" active", "");
            tablinks[i].checked = false
        }

        // Show the current tab, and add an "active" class to the button that opened the tab
        const id = e.currentTarget.id
        if (id === 'query-tab') {
            document.getElementById('query-tab-panel').style.display = 'block'
        } else if (id === 'data-tab') {
            document.getElementById('data-tab-panel').style.display = 'block'
        } else if (id === 'schema-tab') {
            document.getElementById('schema-tab-panel').style.display = 'block'
        } else {
            document.getElementById('metadata-tab-panel').style.display =
                'block'
        }
        e.currentTarget.checked = true
    }
}