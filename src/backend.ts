import { Schema, Field, Type } from "apache-arrow";
import date from 'date-and-time';

import { DateTimeFormatSettings } from './types';

export abstract class Backend {
    public filePath: string;
    public arrowSchema: Schema;
    protected metadata: any;

    private dateTimeFormat: DateTimeFormatSettings;

    public constructor(filePath: string, dateTimeFormat: DateTimeFormatSettings) {
        this.filePath = filePath;
        this.dateTimeFormat = dateTimeFormat;
    }

    static createAsync(filePath: string, dateTimeFormat: DateTimeFormatSettings): Promise<any> {
        throw new Error("Method not implemented");
    };

    abstract initialize(): Promise<void>;

    private parseSchema(field: Field) {
        if (field.typeId === Type.List) {
          let result: any = [];
          
          if (field.type.children.length > 0) {
            result =  [this.parseSchema(field.type.children[0])];
            return result;
          }
          return result;
        } 
        if (field.typeId === Type.Struct) {
          const result: any = {};
          for (const child of field.type.children) {
            result[child.name] = this.parseSchema(child);
          }
          return result;
        }
    
        let type = field.type.toString();
        if (type.includes('Utf8')) {
          type = type.replace(/Utf8/g, 'String');
        } else if (type.includes('LargeUtf8')) {
          type = type.replace(/LargeUtf8/g, 'LargeString');
        }
    
        return type;
      }
    
    // TODO: define a type (interface) for the return type.
    public getSchema(): any { 
        const parsedSchema = this.arrowSchema.fields.map((f, index) => {
            let parsedType = this.parseSchema(f);
            let typeName = parsedType;
            let typeValue = parsedType;
        
            if (typeof parsedType === 'object'){
                parsedType = JSON.stringify(parsedType);
                typeName = 'object';
            }
        
            if(f.metadata.size > 0) {
                console.log(f.metadata);
            }
            return {
                'index': index + 1,
                'name': f.name,
                'type': parsedType,
                'typeName': typeName,
                'typeValue': typeValue,
                'nullable': f.nullable,
                'metadata': JSON.stringify(f.metadata)
            };
        });

        return parsedSchema;
    };

    abstract getSchemaImpl(): Promise<any>;

    public getMetaData(): any {
        return [
            {
                key: 'file_name',
                value: this.metadata[0]["file_name"]
            },
            {
                key: 'created_by',
                value: this.metadata[0]["created_by"]
            },
            {
                key: 'num_rows',
                value: Number(this.metadata[0]["num_rows"])
            },
            {
                key: 'num_row_groups',
                value: Number(this.metadata[0]["num_row_groups"])
            },
            {
                key: 'format_version',
                value: Number(this.metadata[0]["format_version"])
            },
            {
                key: 'encryption_algorithm',
                value: Number(this.metadata[0]["encryption_algorithm"])
            },
            {
                key: 'footer_signing_key_metadata',
                value: Number(this.metadata[0]["footer_signing_key_metadata"])
            },
        ];
    };

    abstract getMetaDataImpl(): Promise<any>;

    abstract getRowCount(): number;

    public async query(query: any): Promise<any[]> {
        const startTime = performance.now();

        const queryResult = await this.queryImpl(query);
        const result = Object.entries(queryResult).map(([k,v]) => {
            return this.convertObjectsToJSONStrings(
                this.convertBigIntToString(k, v)
            );
        });

        const endTime = performance.now();
        const time = endTime - startTime;
        console.log(`Query resolve time: ${time} msec.`);

        return result;
    };

    protected abstract queryImpl(query: any): Promise<any[]>;

    abstract dispose(): any;

    private convertObjectsToJSONStrings(obj: any) {
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    obj[key] = JSON.stringify(obj[key]);
                }
            }
        }
        return obj;
      }

      private convertBigIntToString(key: string, obj: any): any {
        if (Array.isArray(obj)) {
          return Object.entries(obj).map(([key, value]) => this.convertBigIntToString(key, value));
        } 
        else if (obj instanceof Uint8Array) {
          return Array.from(obj.values());
        }
        else if (obj !== null && typeof obj === 'object') {
          if (obj instanceof Date) {
            const field = this.arrowSchema.fields.find(f => f.name === key);
            if (field?.typeId === Type.Date && field?.type.unit === 0) {
                if (this.dateTimeFormat.format === "ISO8601") {
                    return date.format(
                        obj, 'YYYY-MM-DD', true
                    );
                }
                else if (this.dateTimeFormat.format === "RFC2822") {
                    return date.format(
                        obj, 'ddd, DD MMM YYYY', true
                    );
                }
            }
            else {
                if (this.dateTimeFormat.format === "ISO8601") {
                    return obj.toISOString();
                }
                else if (this.dateTimeFormat.format === "RFC2822") {
                    return obj.toUTCString();
                }
                else {
                    return date.format(
                        obj, 
                        this.dateTimeFormat.format, 
                        this.dateTimeFormat.useUTC
                    );
                }
            }
          }

          const newObj: { [key: string]: any } = {};
          for (const [key, value] of Object.entries(obj)) {
            if (obj.hasOwnProperty(key)) {
                newObj[key] = this.convertBigIntToString(key, value);
            }
          }
          return newObj;
        } 
        else if (typeof obj === 'bigint') {
          return obj.toString();
        } 
        else {
          return obj;
        }
      }
}