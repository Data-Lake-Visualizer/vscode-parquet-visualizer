export function getNonce() {
    let text = ''
    const possible =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

export function convertToTabulatorData(array: any[]) {
    return array.map((obj) => {
        const newObj: { [key: string]: any } = {}
        for (const [key, value] of Object.entries(obj)) {
            newObj[key] = String(value) // Convert value to string
        }
        return newObj
    })
}

function convertArrayToString(array: any): any {
    try {
        return String.fromCharCode(...array)
    } catch (error) {
        console.error('Conversion failed:', error)
        return array
    }
}

export function tryConvertObjectArraysToStrings(obj: any): any {
    if (obj instanceof Uint8Array) {
        return convertArrayToString(obj)
    } else if (obj !== null && typeof obj === 'object') {
        const result: Record<string, any> = {}
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                result[key] = tryConvertObjectArraysToStrings(obj[key])
            }
        }
        return result
    } else {
        return obj
    }
}

export function createHeadersFromData(data: any) {
    // create header object
    let headers: any[] = []
    if (data.length > 0) {
        headers = Object.keys(data[0]).map((f) => {
            return {
                title: f,
                field: f,
            }
        })
    }
    return headers
}

export function replacePeriodWithUnderscoreInKey(data: any) {
    return data.map((obj: { [x: string]: any }) => {
        const newObj: { [key: string]: any } = {}

        Object.keys(obj).forEach((key) => {
            const newKey = key.replace(/\./g, '_') // Replace all periods with underscores
            newObj[newKey] = obj[key]
        })

        return newObj
    })
}

export function isRunningInWSL() {
    return !!process.env.WSL_INTEROP || !!process.env.WSL_DISTRO_NAME
}

export function getPageCountFromInput(pageSize: string, totalItems: number) {
    let pageCount: number
    if (pageSize === undefined) {
        pageCount = 1
    } else {
        pageCount = Math.ceil(totalItems / Number(pageSize))
    }
    return pageCount
}
