/**
 * Parses a DuckDB type string and converts it to Arrow format
 *
 * @param typeString - The type string from DESCRIBE (e.g., "INTEGER", "STRUCT(a INTEGER, b VARCHAR)")
 * @returns The formatted type representation
 */
export function parseTypeString(typeString: string): any {
    // Remove extra whitespace and normalize
    const cleanType = typeString.trim()

    // Handle basic types first
    if (isBasicType(cleanType)) {
        return mapBasicTypeToArrow(cleanType)
    }

    // Handle complex types
    if (cleanType.startsWith('STRUCT(')) {
        return parseStructType(cleanType)
    } else if (cleanType.startsWith('LIST(') || cleanType.includes('[]')) {
        return parseListType(cleanType)
    } else if (cleanType.startsWith('MAP(')) {
        return parseMapType(cleanType)
    } else if (cleanType.startsWith('ARRAY(')) {
        return parseArrayType(cleanType)
    } else if (cleanType.startsWith('UNION(')) {
        return parseUnionType(cleanType)
    }

    // If we can't parse it, return as-is but try to map basic patterns
    return mapBasicTypeToArrow(cleanType)
}

/**
 * Checks if a type string represents a basic (non-complex) type
 */
function isBasicType(typeString: string): boolean {
    const basicTypes = [
        'BOOLEAN',
        'BOOL',
        'TINYINT',
        'SMALLINT',
        'INTEGER',
        'INT',
        'BIGINT',
        'UTINYINT',
        'USMALLINT',
        'UINTEGER',
        'UBIGINT',
        'REAL',
        'FLOAT',
        'DOUBLE',
        'DECIMAL',
        'VARCHAR',
        'STRING',
        'TEXT',
        'CHAR',
        'BLOB',
        'BYTEA',
        'DATE',
        'TIME',
        'TIMESTAMP',
        'INTERVAL',
        'UUID',
        'JSON',
    ]

    const upperType = typeString.toUpperCase()
    return basicTypes.some(
        (basicType) =>
            upperType === basicType || upperType.startsWith(basicType + '(') // For types like DECIMAL(18,3)
    )
}

/**
 * Maps basic DuckDB types to Arrow format
 */
function mapBasicTypeToArrow(typeString: string): string {
    const upperType = typeString.toUpperCase()

    // Handle types with parameters (like DECIMAL(18,3))
    if (upperType.startsWith('DECIMAL(')) {
        const match = upperType.match(/DECIMAL\((\d+),?\s*(\d+)?\)/)
        if (match) {
            const precision = match[1] || '18'
            const scale = match[2] || '3'
            return `Decimal128(${precision}, ${scale})`
        }
        return 'Decimal128(18, 3)'
    }

    if (upperType.startsWith('VARCHAR(')) {
        return 'String'
    }

    // Map basic types
    switch (upperType) {
        case 'BOOLEAN':
        case 'BOOL':
            return 'Bool'
        case 'TINYINT':
            return 'Int8'
        case 'SMALLINT':
            return 'Int16'
        case 'INTEGER':
        case 'INT':
            return 'Int32'
        case 'BIGINT':
            return 'Int64'
        case 'UTINYINT':
            return 'Uint8'
        case 'USMALLINT':
            return 'Uint16'
        case 'UINTEGER':
            return 'Uint32'
        case 'UBIGINT':
            return 'Uint64'
        case 'REAL':
        case 'FLOAT':
            return 'Float32'
        case 'DOUBLE':
            return 'Float64'
        case 'VARCHAR':
        case 'STRING':
        case 'TEXT':
        case 'CHAR':
            return 'String'
        case 'BLOB':
        case 'BYTEA':
            return 'Binary'
        case 'DATE':
            return 'Date32'
        case 'TIME':
            return 'Time64'
        case 'TIMESTAMP':
            return 'Timestamp'
        case 'INTERVAL':
            return 'Interval'
        case 'UUID':
            return 'String'
        case 'JSON':
            return 'String'
        default:
            return typeString // Return original if not recognized
    }
}

/**
 * Parses a STRUCT type string like "STRUCT(a INTEGER, b VARCHAR)"
 */
function parseStructType(typeString: string): Record<string, any> | any {
    const result: Record<string, any> = {}

    // Extract content between STRUCT( and )
    const match = typeString.match(/STRUCT\((.*)\)$/i)
    if (!match) {
        return {}
    }

    const content = match[1]
    const fields = parseStructFields(content)

    for (const field of fields) {
        result[field.name] = parseTypeString(field.type)
    }

    // Special case: if this struct has only one field and it's a complex type,
    // unwrap it to match the expected schema format from the old version
    if (fields.length === 1) {
        const singleField = fields[0]
        const parsedFieldType = parseTypeString(singleField.type)

        // If the single field is a list or other complex type, return it directly
        if (
            Array.isArray(parsedFieldType) ||
            (typeof parsedFieldType === 'object' &&
                parsedFieldType !== null &&
                Object.keys(parsedFieldType).length > 0)
        ) {
            return parsedFieldType
        }
    }

    return result
}

/**
 * Parses struct fields from a string like "a INTEGER, b VARCHAR, c STRUCT(x INTEGER)"
 */
function parseStructFields(
    content: string
): Array<{ name: string; type: string }> {
    const fields: Array<{ name: string; type: string }> = []
    const tokens = tokenizeStructFields(content)

    for (let i = 0; i < tokens.length; i += 2) {
        if (i + 1 < tokens.length) {
            let fieldType = tokens[i + 1]

            // Check if this field type has array notation []
            if (fieldType.endsWith('[]')) {
                const elementType = fieldType.replace('[]', '').trim()
                // Create a list structure for array types
                fields.push({
                    name: tokens[i],
                    type: `LIST(${elementType})`,
                })
            } else {
                fields.push({
                    name: tokens[i],
                    type: fieldType,
                })
            }
        }
    }

    return fields
}

/**
 * Tokenizes struct fields, handling nested parentheses correctly
 */
function tokenizeStructFields(content: string): string[] {
    const tokens: string[] = []
    let current = ''
    let depth = 0
    let i = 0

    while (i < content.length) {
        const char = content[i]

        if (char === '(') {
            depth++
            current += char
        } else if (char === ')') {
            depth--
            current += char
        } else if (depth === 0 && char === ',') {
            // End of field, add the current token
            if (current.trim()) {
                tokens.push(current.trim())
                current = ''
            }
        } else if (
            depth === 0 &&
            char === ' ' &&
            current.trim() &&
            !current.includes('(')
        ) {
            // Space between field name and type
            let fieldName = current.trim()
            // Remove quotes from field names
            if (fieldName.startsWith('"') && fieldName.endsWith('"')) {
                fieldName = fieldName.slice(1, -1)
            }
            tokens.push(fieldName)
            current = ''
            // Skip any additional spaces
            while (i + 1 < content.length && content[i + 1] === ' ') {
                i++
            }
        } else {
            current += char
        }

        i++
    }

    // Add the last token
    if (current.trim()) {
        let lastToken = current.trim()
        // Remove quotes from field names if this is a field name (not a type)
        if (
            tokens.length % 2 === 0 &&
            lastToken.startsWith('"') &&
            lastToken.endsWith('"') &&
            !lastToken.includes('(')
        ) {
            lastToken = lastToken.slice(1, -1)
        }
        tokens.push(lastToken)
    }

    return tokens
}

/**
 * Parses a LIST type string like "LIST(INTEGER)" or "INTEGER[]"
 */
function parseListType(typeString: string): any {
    // Handle array notation like "INTEGER[]"
    if (typeString.includes('[]')) {
        const elementType = typeString.replace('[]', '').trim()
        const parsedElementType = parseTypeString(elementType)
        return [parsedElementType]
    }

    // Handle LIST(type) notation
    const match = typeString.match(/LIST\((.*)\)$/i)
    if (match) {
        const elementType = match[1].trim()
        const parsedElementType = parseTypeString(elementType)
        return [parsedElementType]
    }

    return []
}

/**
 * Parses a MAP type string like "MAP(VARCHAR, INTEGER)"
 */
function parseMapType(typeString: string): string {
    const match = typeString.match(/MAP\((.*),\s*(.*)\)$/i)
    if (match) {
        const keyType = parseTypeString(match[1].trim())
        const valueType = parseTypeString(match[2].trim())
        return `<${keyType}, ${valueType}>`
    }

    return '<>'
}

/**
 * Parses an ARRAY type string like "ARRAY(INTEGER, 10)"
 */
function parseArrayType(typeString: string): any[] {
    const match = typeString.match(/ARRAY\((.*?)(?:,\s*\d+)?\)$/i)
    if (match) {
        const elementType = match[1].trim()
        return [parseTypeString(elementType)]
    }

    return []
}

/**
 * Parses a UNION type string like "UNION(name VARCHAR, age INTEGER)"
 */
function parseUnionType(typeString: string): Record<string, any> {
    const result: Record<string, any> = {}

    const match = typeString.match(/UNION\((.*)\)$/i)
    if (!match) {
        return {}
    }

    const content = match[1]
    const fields = parseStructFields(content) // Reuse struct field parsing

    for (const field of fields) {
        result[field.name] = parseTypeString(field.type)
    }

    return result
}
