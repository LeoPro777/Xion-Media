import {
  validationMetadatasToSchemas,
  targetConstructorToSchema,
} from 'class-validator-jsonschema';
import { ValidationTypes } from 'class-validator';
// @ts-ignore
import { defaultMetadataStorage } from 'class-transformer/cjs/storage';

function cleanDefinitions(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanDefinitions);
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '$ref' && typeof v === 'string' && v.includes('#/definitions/')) {
      continue;
    }
    result[k] = cleanDefinitions(v);
  }
  return result;
}

export function getValidationSchemas() {
  const schemas = validationMetadatasToSchemas({
    classTransformerMetadataStorage: defaultMetadataStorage,
    additionalConverters: {
      [ValidationTypes.NESTED_VALIDATION]: (meta, options) => {
        if (typeof meta.target === 'function') {
          const typeMeta = options.classTransformerMetadataStorage
            ? options.classTransformerMetadataStorage.findTypeMetadata(
                meta.target,
                meta.propertyName
              )
            : null;
          if (typeMeta) {
            const childType = typeMeta.typeFunction();
            return targetConstructorToSchema(childType, options);
          }
        }
        return {};
      },
    },
  });

  return cleanDefinitions(schemas);
}
